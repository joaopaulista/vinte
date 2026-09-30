import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { installmentsOf, isCreditCard, isSettled, PluggyClient, signedAmount } from './pluggy.ts';
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

    const transactions = (await pluggy.listTransactions(pluggyAccount.id, dateFrom)).filter(
      isSettled,
    );
    if (transactions.length === 0) continue;

    // Parcela ("6 de 8") só existe em cartão; em conta corrente fica nulo.
    const onCard = isCreditCard(pluggyAccount);

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
          reconciliation_status: 'pending',
        })),
        { onConflict: 'user_id,pluggy_transaction_id', ignoreDuplicates: true },
      )
      .select('id');

    if (insertError) throw insertError;
    transactionsInserted += inserted?.length ?? 0;

    // Transações que já existiam (importadas antes das parcelas serem
    // guardadas) recebem os dados de parcela agora. O upsert só atualiza as
    // colunas enviadas aqui — categoria, status e observação da conciliação
    // não estão na lista e ficam intactos. Valor e data vão só porque são
    // obrigatórios na linha, e são os mesmos do Pluggy.
    if (onCard) {
      const withInstallments = transactions.filter(
        (transaction) => (transaction.creditCardMetadata?.totalInstallments ?? 0) > 1,
      );
      if (withInstallments.length > 0) {
        const { error: metadataError } = await supabase.from('transactions').upsert(
          withInstallments.map((transaction) => ({
            user_id: target.userId,
            account_id: account.id,
            pluggy_transaction_id: transaction.id,
            amount: signedAmount(transaction),
            transaction_date: transaction.date.slice(0, 10),
            pluggy_category: transaction.category ?? null,
            ...installmentsOf(transaction),
          })),
          { onConflict: 'user_id,pluggy_transaction_id' },
        );
        if (metadataError) throw metadataError;
      }
    }
  }

  await supabase
    .from('bank_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', target.connectionId);

  return { accountsSynced, transactionsInserted };
}
