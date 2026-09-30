import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isSettled, PluggyClient, signedAmount } from './pluggy.ts';

export interface SyncTarget {
  connectionId: string;
  userId: string;
  pluggyItemId: string;
}

export interface SyncResult {
  accountsSynced: number;
  transactionsInserted: number;
}

/**
 * Traz contas e extrato de uma conexão para o Supabase.
 *
 * Usada tanto pela sincronização sob demanda quanto pelo webhook, por isso
 * recebe o client já montado (num caso com o JWT do usuário, no outro com a
 * service role) e o `userId` explícito.
 */
export async function syncConnection(
  supabase: SupabaseClient,
  pluggy: PluggyClient,
  target: SyncTarget,
  lookbackDays: number,
): Promise<SyncResult> {
  const dateFrom = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const { results: pluggyAccounts } = await pluggy.listAccounts(target.pluggyItemId);

  let accountsSynced = 0;
  let transactionsInserted = 0;

  for (const pluggyAccount of pluggyAccounts) {
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .upsert(
        {
          user_id: target.userId,
          bank_connection_id: target.connectionId,
          pluggy_account_id: pluggyAccount.id,
          name: pluggyAccount.name,
          type: pluggyAccount.subtype ?? pluggyAccount.type,
          balance: pluggyAccount.balance,
          currency: pluggyAccount.currencyCode ?? 'BRL',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,pluggy_account_id' },
      )
      .select('id')
      .single();

    if (accountError) throw accountError;
    accountsSynced += 1;

    const transactions = (await pluggy.listTransactions(pluggyAccount.id, dateFrom)).filter(
      isSettled,
    );
    if (transactions.length === 0) continue;

    // `ignoreDuplicates` é essencial: sem ele, um re-sync sobrescreveria a
    // categoria e o status de transações que o usuário já conciliou.
    const { data: inserted, error: insertError } = await supabase
      .from('transactions')
      .upsert(
        transactions.map((transaction) => ({
          user_id: target.userId,
          account_id: account.id,
          pluggy_transaction_id: transaction.id,
          description: transaction.description,
          amount: signedAmount(transaction),
          transaction_date: transaction.date.slice(0, 10),
          type: transaction.type,
          reconciliation_status: 'pending',
        })),
        { onConflict: 'pluggy_transaction_id', ignoreDuplicates: true },
      )
      .select('id');

    if (insertError) throw insertError;
    transactionsInserted += inserted?.length ?? 0;
  }

  await supabase
    .from('bank_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', target.connectionId);

  return { accountsSynced, transactionsInserted };
}
