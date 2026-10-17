import { supabase } from './supabaseClient';
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
  installment_number, total_installments, purchase_date, created_at,
  account:accounts!transactions_account_id_fkey (id, name, type),
  category:categories!transactions_category_id_fkey (id, name, color, icon),
  subcategory:categories!transactions_subcategory_id_fkey (id, name)
`;

export interface FetchTransactionsOptions extends Partial<TransactionFilters> {
  limit?: number;
}

export async function fetchTransactions(
  options: FetchTransactionsOptions = {},
): Promise<TransactionWithRelations[]> {
  let query = supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.status && options.status !== 'all') {
    query = query.eq('reconciliation_status', options.status);
  }

  if (options.categoryId && options.categoryId !== 'all') {
    query = query.eq('category_id', options.categoryId);
  }

  if (options.from) {
    query = query.gte('transaction_date', options.from);
  }

  if (options.to) {
    query = query.lte('transaction_date', options.to);
  }

  if (options.search?.trim()) {
    query = query.ilike('description', `%${options.search.trim()}%`);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  // O PostgREST devolve os embeds como array quando não consegue inferir a
  // cardinalidade; normalizamos para objeto único.
  return (data ?? []).map(normalizeTransaction);
}

export async function countPendingTransactions(): Promise<number> {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('reconciliation_status', 'pending');

  if (error) throw error;
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

  if (error) throw error;
}

/** Devolve uma transação já conciliada para a fila de pendentes. */
export async function reopenTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ reconciliation_status: 'pending', reconciled_at: null })
    .eq('id', transactionId);

  if (error) throw error;
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

  if (error) throw error;
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

  if (error) throw error;
  return lines.length;
}
