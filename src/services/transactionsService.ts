import { supabase, toError } from './supabaseClient';
import type {
  ReconciliationStatus,
  TransactionFilters,
  TransactionWithRelations,
} from '@/types';

/**
 * `category` e `subcategory` apontam para a mesma tabela, então o PostgREST
 * exige que o relacionamento seja desambiguado pelo nome da foreign key.
 */
const TRANSACTION_SELECT = `
  id, user_id, account_id, pluggy_transaction_id, description, amount,
  transaction_date, type, category_id, subcategory_id,
  reconciliation_status, reconciled_at, notes, auto_categorized, bill_payment,
  installment_number, total_installments, purchase_date, manual_entry, accounting_date, created_at,
  account:accounts!transactions_account_id_fkey (id, name, type, is_manual, owner_id),
  category:categories!transactions_category_id_fkey (id, name, color, icon),
  subcategory:categories!transactions_subcategory_id_fkey (id, name)
`;

export interface FetchTransactionsOptions extends Partial<TransactionFilters> {
  limit?: number;
}

export async function fetchTransactions(
  options: FetchTransactionsOptions = {},
): Promise<TransactionWithRelations[]> {
  if (options.limit) return fetchTransactionsPage(options, 0, options.limit);

  // O PostgREST devolve no máximo 1.000 linhas por pedido: períodos longos
  // (relatório de 12 meses, por exemplo) são buscados em páginas.
  const all: TransactionWithRelations[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchTransactionsPage(options, offset, PAGE_SIZE);
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

const PAGE_SIZE = 1000;

async function fetchTransactionsPage(
  options: FetchTransactionsOptions,
  offset: number,
  size: number,
): Promise<TransactionWithRelations[]> {
  let query = supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (options.status && options.status !== 'all') {
    query = query.eq('reconciliation_status', options.status);
  }

  if (options.categoryId && options.categoryId !== 'all') {
    query = query.eq('category_id', options.categoryId);
  }

  if (options.from) {
    query = query.gte('accounting_date', options.from);
  }

  if (options.to) {
    query = query.lte('accounting_date', options.to);
  }

  if (options.search?.trim()) {
    query = query.ilike('description', `%${options.search.trim()}%`);
  }

  const { data, error } = await query.range(offset, offset + size - 1);
  if (error) throw toError(error);

  // O PostgREST devolve os embeds como array quando não consegue inferir a
  // cardinalidade; normalizamos para objeto único.
  return (data ?? []).map(normalizeTransaction);
}

export async function countPendingTransactions(): Promise<number> {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('reconciliation_status', 'pending');

  if (error) throw toError(error);
  return count ?? 0;
}

export interface ReconcileInput {
  transactionId: string;
  status: Extract<ReconciliationStatus, 'approved' | 'rejected'>;
  categoryId?: string | null;
  subcategoryId?: string | null;
  notes?: string | null;
}

/**
 * Aprova ou reprova uma transação, gravando categoria/subcategoria escolhidas.
 *
 * `auto_categorized` volta a false porque, depois de o usuário confirmar, a
 * categoria deixa de ser sugestão e passa a ser decisão dele.
 */
export async function reconcileTransaction(input: ReconcileInput): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      reconciliation_status: input.status,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      notes: input.notes ?? null,
      auto_categorized: false,
      reconciled_at: new Date().toISOString(),
    })
    .eq('id', input.transactionId);

  if (error) throw toError(error);
}

/** Devolve uma transação já conciliada para a fila de pendentes. */
export async function reopenTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ reconciliation_status: 'pending', reconciled_at: null })
    .eq('id', transactionId);

  if (error) throw toError(error);
}

type RawRelation<T> = T | T[] | null;

function firstOrNull<T>(relation: RawRelation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function normalizeTransaction(row: Record<string, unknown>): TransactionWithRelations {
  const { account, category, subcategory, ...rest } = row as Record<string, unknown> & {
    account: RawRelation<TransactionWithRelations['account']>;
    category: RawRelation<TransactionWithRelations['category']>;
    subcategory: RawRelation<TransactionWithRelations['subcategory']>;
  };

  return {
    ...(rest as Omit<TransactionWithRelations, 'account' | 'category' | 'subcategory'>),
    amount: Number(rest.amount),
    account: firstOrNull(account),
    category: firstOrNull(category),
    subcategory: firstOrNull(subcategory),
  };
}

/** Transações da conta no intervalo, em qualquer status: base da regra de duplicidade. */
export async function fetchAccountEntries(
  accountId: string,
  from: string,
  to: string,
): Promise<{ transaction_date: string; amount: number; description: string | null }[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('transaction_date, amount, description')
    .eq('account_id', accountId)
    .gte('transaction_date', from)
    .lte('transaction_date', to);

  if (error) throw toError(error);
  return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export interface ImportedLine {
  date: string;
  description: string;
  amount: number;
}

/**
 * Grava as linhas do extrato como pendentes. As regras de categoria e a
 * marcação de pagamento de fatura rodam nos triggers do banco, como no sync.
 */
export async function importStatementLines(
  userId: string,
  accountId: string,
  lines: ImportedLine[],
): Promise<number> {
  if (lines.length === 0) return 0;
  const { error } = await supabase.from('transactions').insert(
    lines.map((line) => ({
      user_id: userId,
      account_id: accountId,
      description: line.description,
      amount: line.amount,
      transaction_date: line.date,
      type: line.amount < 0 ? 'DEBIT' : 'CREDIT',
      reconciliation_status: 'pending',
    })),
  );

  if (error) throw toError(error);
  return lines.length;
}

export interface ManualEntryInput {
  accountId: string;
  description: string;
  /** Negativo = saída, positivo = entrada. */
  amount: number;
  date: string;
  categoryId: string | null;
  subcategoryId: string | null;
  notes: string | null;
}

/**
 * Lançamento digitado pelo usuário numa conta manual. Entra aprovado: quem
 * lança já disse o que é. O banco recalcula o saldo da conta (migration 0011)
 * e recusa lançamento manual em conta do Open Finance (migration 0013).
 */
export async function createManualEntry(userId: string, input: ManualEntryInput): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    account_id: input.accountId,
    description: input.description,
    amount: input.amount,
    transaction_date: input.date,
    type: input.amount < 0 ? 'DEBIT' : 'CREDIT',
    category_id: input.categoryId,
    subcategory_id: input.subcategoryId,
    notes: input.notes,
    manual_entry: true,
    reconciliation_status: 'approved',
    reconciled_at: new Date().toISOString(),
  });
  if (error) throw toError(error);
}

export async function updateManualEntry(transactionId: string, input: ManualEntryInput): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      account_id: input.accountId,
      description: input.description,
      amount: input.amount,
      transaction_date: input.date,
      type: input.amount < 0 ? 'DEBIT' : 'CREDIT',
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
      notes: input.notes,
      auto_categorized: false,
    })
    .eq('id', transactionId)
    .eq('manual_entry', true);
  if (error) throw toError(error);
}

/** Só lançamentos manuais podem ser apagados: os do banco voltariam no próximo sync. */
export async function deleteManualEntry(transactionId: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', transactionId).eq('manual_entry', true);
  if (error) throw toError(error);
}

/**
 * Busca textual para a pesquisa geral: descrição ou observação contendo o
 * termo. Vírgulas e parênteses têm significado no filtro `or` do PostgREST,
 * então viram espaço.
 */
export async function searchTransactionsText(term: string, limit: number): Promise<TransactionWithRelations[]> {
  const safe = term.replace(/[,()*%\\]/g, ' ').trim();
  if (!safe) return [];
  const pattern = `%${safe.replace(/\s+/g, '%')}%`;
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .or(`description.ilike.${pattern},notes.ilike.${pattern}`)
    .order('transaction_date', { ascending: false })
    .limit(limit);
  if (error) throw toError(error);
  return (data ?? []).map(normalizeTransaction);
}
