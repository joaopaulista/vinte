import { supabase } from './supabaseClient';
import type { AccountWithConnection, BankConnection } from '@/types';

export async function fetchAccounts(): Promise<AccountWithConnection[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(
      `id, user_id, bank_connection_id, pluggy_account_id, name, type, balance, currency,
       updated_at, created_at,
       bank_connection:bank_connections!accounts_bank_connection_id_fkey (id, institution_name, status)`,
    )
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const { bank_connection: connection, ...rest } = row as Record<string, unknown> & {
      bank_connection: AccountWithConnection['bank_connection'] | AccountWithConnection['bank_connection'][];
    };

    return {
      ...(rest as Omit<AccountWithConnection, 'bank_connection'>),
      balance: rest.balance === null ? null : Number(rest.balance),
      bank_connection: Array.isArray(connection) ? (connection[0] ?? null) : connection,
    };
  });
}

export async function fetchBankConnections(): Promise<BankConnection[]> {
  const { data, error } = await supabase
    .from('bank_connections')
    .select('id, user_id, pluggy_item_id, institution_name, status, last_synced_at, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as BankConnection[];
}
