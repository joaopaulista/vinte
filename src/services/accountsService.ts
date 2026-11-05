import { supabase, toError } from './supabaseClient';
import type { AccountWithConnection, BankConnection } from '@/types';

const ACCOUNT_SELECT = `id, user_id, bank_connection_id, pluggy_account_id, name, type, balance, currency,
  is_manual, initial_balance, owner_id, updated_at, created_at,
  bank_connection:bank_connections!accounts_bank_connection_id_fkey (id, institution_name, status)`;

export async function fetchAccounts(): Promise<AccountWithConnection[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(ACCOUNT_SELECT)
    .order('created_at', { ascending: true });

  if (error) throw toError(error);

  return (data ?? []).map((row) => {
    const { bank_connection: connection, ...rest } = row as Record<string, unknown> & {
      bank_connection: AccountWithConnection['bank_connection'] | AccountWithConnection['bank_connection'][];
    };

    return {
      ...(rest as Omit<AccountWithConnection, 'bank_connection'>),
      balance: rest.balance === null ? null : Number(rest.balance),
      initial_balance: Number(rest.initial_balance ?? 0),
      bank_connection: Array.isArray(connection) ? (connection[0] ?? null) : connection,
    };
  });
}

export async function fetchBankConnections(): Promise<BankConnection[]> {
  const { data, error } = await supabase
    .from('bank_connections')
    .select('id, user_id, pluggy_item_id, institution_name, status, last_synced_at, created_at')
    .order('created_at', { ascending: true });

  if (error) throw toError(error);
  return (data ?? []) as BankConnection[];
}

/** Tipos de conta manual. O de crédito fica de fora: fatura só vem do Open Finance. */
export const MANUAL_ACCOUNT_TYPES = [
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CHECKING_ACCOUNT', label: 'Conta corrente' },
  { value: 'SAVINGS_ACCOUNT', label: 'Poupança' },
  { value: 'INVESTMENT', label: 'Investimento' },
  { value: 'OTHER', label: 'Outra' },
] as const;

export interface ManualAccountInput {
  name: string;
  type: string;
  /** Saldo de hoje. O banco guarda o inicial e soma os lançamentos. */
  balance: number;
}

export async function createManualAccount(userId: string, input: ManualAccountInput): Promise<void> {
  const { error } = await supabase.from('accounts').insert({
    user_id: userId,
    name: input.name,
    type: input.type,
    is_manual: true,
    initial_balance: input.balance,
  });
  if (error) throw toError(error);
}

/**
 * O saldo da conta manual é `inicial + lançamentos`. Para o saldo novo bater
 * com o digitado, o inicial passa a ser o digitado menos o que os lançamentos
 * já somam.
 */
export async function updateManualAccount(
  account: Pick<AccountWithConnection, 'id' | 'balance' | 'initial_balance'>,
  input: ManualAccountInput,
): Promise<void> {
  const entriesTotal = (account.balance ?? 0) - account.initial_balance;
  const { error } = await supabase
    .from('accounts')
    .update({
      name: input.name,
      type: input.type,
      initial_balance: Math.round((input.balance - entriesTotal) * 100) / 100,
    })
    .eq('id', account.id)
    .eq('is_manual', true);
  if (error) throw toError(error);
}

/** Apaga a conta manual e, junto (cascade), os lançamentos dela. */
export async function deleteManualAccount(accountId: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', accountId).eq('is_manual', true);
  if (error) throw toError(error);
}
