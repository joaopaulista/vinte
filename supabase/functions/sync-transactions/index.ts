/**
 * Sincroniza contas e transações do Pluggy para o Supabase.
 *
 * Chamada com o JWT do usuário logado — o client abaixo herda esse JWT, então
 * a RLS continua valendo e a função só enxerga os dados de quem chamou.
 *
 * Body (opcional):
 *   { "itemId": "<uuid do item Pluggy>" }
 * Quando vem `itemId`, a conexão é registrada antes de sincronizar. É o que o
 * widget Pluggy Connect envia logo depois do onSuccess.
 *
 *   supabase functions deploy sync-transactions
 *   supabase secrets set PLUGGY_CLIENT_ID=... PLUGGY_CLIENT_SECRET=...
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PluggyClient } from '../_shared/pluggy.ts';
import { syncConnection } from '../_shared/sync.ts';
import { errorResponse, isUuid, json, preflight, PublicError } from '../_shared/http.ts';

/** Janela padrão de busca. Cobre reprocessamentos do banco sem puxar o histórico inteiro. */
const LOOKBACK_DAYS = 90;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405, request);

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return json({ error: 'Authorization header ausente' }, 401, request);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: 'Sessão inválida' }, 401, request);
  }
  const userId = userData.user.id;

  let itemId: unknown;
  try {
    const body = (await request.json()) as { itemId?: unknown };
    itemId = body?.itemId;
  } catch {
    // Body vazio é um caso válido: significa "sincronize tudo que já existe".
  }

  if (itemId !== undefined && !isUuid(itemId)) {
    return json({ error: 'itemId inválido' }, 400, request);
  }

  try {
    const pluggy = await PluggyClient.connect();

    if (itemId) {
      await registerConnection(supabase, pluggy, userId, itemId);
    }

    const { data: connections, error: connectionsError } = await supabase
      .from('bank_connections')
      .select('id, user_id, pluggy_item_id')
      .eq('status', 'active');

    if (connectionsError) throw connectionsError;

    let accountsSynced = 0;
    let transactionsInserted = 0;

    for (const connection of connections ?? []) {
      const result = await syncConnection(
        supabase,
        pluggy,
        {
          connectionId: connection.id,
          userId: connection.user_id,
          pluggyItemId: connection.pluggy_item_id,
        },
        LOOKBACK_DAYS,
      );
      accountsSynced += result.accountsSynced;
      transactionsInserted += result.transactionsInserted;
    }

    return json(
      {
        connections: connections?.length ?? 0,
        accountsSynced,
        transactionsInserted,
      },
      200,
      request,
    );
  } catch (cause) {
    console.error('sync-transactions falhou', cause);
    return errorResponse(cause, request);
  }
});

/**
 * Grava a conexão recém-criada no widget. O nome da instituição vem do próprio
 * Pluggy para não depender do que o frontend mandar.
 *
 * As credenciais do Pluggy são da aplicação, não do usuário: elas enxergam os
 * itens de TODOS os usuários. Sem conferir o `clientUserId`, qualquer pessoa
 * logada que descobrisse o itemId de outra poderia registrá-lo para si e puxar
 * o extrato alheio. O connect token amarra o item ao usuário que o criou, e é
 * isso que conferimos aqui.
 */
async function registerConnection(
  supabase: SupabaseClient,
  pluggy: PluggyClient,
  userId: string,
  itemId: string,
): Promise<void> {
  const item = await pluggy.getItem(itemId);
  if (item.clientUserId !== userId) {
    throw new PublicError('Conexão não pertence a este usuário', 403);
  }

  const { error } = await supabase.from('bank_connections').upsert(
    {
      user_id: userId,
      pluggy_item_id: itemId,
      institution_name: item.connector?.name ?? 'Instituição',
      status: 'active',
    },
    { onConflict: 'user_id,pluggy_item_id' },
  );

  if (error) throw error;
}
