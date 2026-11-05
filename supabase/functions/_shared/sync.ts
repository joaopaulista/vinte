import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { installmentsOf, isCreditCard, PluggyClient, signedAmount } from './pluggy.ts';
import { isUuid, PublicError } from './http.ts';

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
  // Conexões de demonstração (seed) não existem no Pluggy.
  if (!isUuid(target.pluggyItemId)) return { accountsSynced: 0, transactionsInserted: 0 };

  // A RLS deixa o usuário gravar qualquer `pluggy_item_id` na própria linha de
  // bank_connections, e as credenciais do Pluggy enxergam os itens de todos.
  // Por isso a posse é conferida aqui, no único caminho que puxa extrato — e
  // não só no registro da conexão.
  const item = await pluggy.getItem(target.pluggyItemId);
  if (item.clientUserId !== target.userId) {
    throw new PublicError('Conexão não pertence a este usuário', 403);
  }

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

    // Entram também as PENDING: no cartão, vários bancos deixam assim as
    // compras da fatura aberta até o fechamento (migration 0016).
    const transactions = await pluggy.listTransactions(pluggyAccount.id, dateFrom);

    // Parcela ("6 de 8") só existe em cartão; em conta corrente fica nulo.
    const onCard = isCreditCard(pluggyAccount);

    // Compra que o banco tinha mandado em aberto e deixou de mandar (cancelada,
    // ou liquidada com outro id): sai, para não contar em dobro nem ficar
    // fantasma. Só olha a janela que acabou de ser consultada.
    const returnedIds = new Set(transactions.map((transaction) => transaction.id));
    const { data: stalePending, error: staleError } = await supabase
      .from('transactions')
      .select('id, pluggy_transaction_id')
      .eq('account_id', account.id)
      .eq('bank_status', 'PENDING')
      .gte('transaction_date', dateFrom);
    if (staleError) throw staleError;
    const vanished = (stalePending ?? []).filter((row) => !returnedIds.has(row.pluggy_transaction_id));
    if (vanished.length > 0) {
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .in('id', vanished.map((row) => row.id));
      if (deleteError) throw deleteError;
    }

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
          // Usada pela migration 0009 para reconhecer pagamento de fatura.
          pluggy_category: transaction.category ?? null,
          ...(onCard ? installmentsOf(transaction) : {}),
          bank_status: transaction.status === 'PENDING' ? 'PENDING' : 'POSTED',
          reconciliation_status: 'pending',
        })),
        { onConflict: 'user_id,pluggy_transaction_id', ignoreDuplicates: true },
      )
      .select('id');

    if (insertError) throw insertError;
    transactionsInserted += inserted?.length ?? 0;

    // As que já existiam recebem o que o banco diz delas agora: valor, data e
    // descrição (que mudam quando a compra em aberto é liquidada), situação no
    // banco e parcelas. O upsert só atualiza as colunas enviadas — categoria,
    // status e observação da conciliação ficam intactos.
    const { error: refreshError } = await supabase.from('transactions').upsert(
      transactions.map((transaction) => ({
        user_id: target.userId,
        account_id: account.id,
        pluggy_transaction_id: transaction.id,
        description: transaction.description,
        amount: signedAmount(transaction),
        transaction_date: transaction.date.slice(0, 10),
        pluggy_category: transaction.category ?? null,
        bank_status: transaction.status === 'PENDING' ? 'PENDING' : 'POSTED',
        ...(onCard ? installmentsOf(transaction) : {}),
      })),
      { onConflict: 'user_id,pluggy_transaction_id' },
    );
    if (refreshError) throw refreshError;
  }

  await supabase
    .from('bank_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', target.connectionId);

  return { accountsSynced, transactionsInserted };
}
