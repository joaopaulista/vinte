/**
 * Recebe eventos do Pluggy (ex.: `transactions/created`) e sincroniza o item
 * correspondente na hora, em vez de esperar o próximo sync.
 *
 * Roda sem JWT (o Pluggy não tem sessão de usuário), então:
 *   - a autorização é um segredo compartilhado no header `x-webhook-secret`;
 *   - o acesso ao banco usa a service role e SEMPRE parte do user_id que é dono
 *     do item — a RLS não protege a service role.
 *
 *   supabase functions deploy pluggy-webhook --no-verify-jwt
 *   supabase secrets set PLUGGY_WEBHOOK_SECRET=<algo-aleatorio-e-longo>
 *
 * URL a cadastrar no Pluggy:
 *   https://<project-ref>.functions.supabase.co/pluggy-webhook?secret=<o-mesmo-segredo>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PluggyClient } from '../_shared/pluggy.ts';
import { syncConnection } from '../_shared/sync.ts';
import { errorResponse, isUuid, json } from '../_shared/http.ts';

const LOOKBACK_DAYS = 30;

/** Só eventos que mexem em extrato justificam uma sincronização. */
const RELEVANT_EVENTS = ['transactions/created', 'transactions/updated', 'item/updated'];

interface PluggyWebhookPayload {
  event: string;
  itemId: string;
}

/**
 * Comparação em tempo constante. Um `!==` normal sai no primeiro caractere
 * diferente, e essa diferença de tempo permite descobrir o segredo byte a byte.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }

  // O cadastro de webhook no Pluggy aceita só a URL, sem headers customizados,
  // então o segredo também é aceito via query string. Header é preferível
  // (não vaza em log de proxy); use a query só quando não houver alternativa.
  const expectedSecret = Deno.env.get('PLUGGY_WEBHOOK_SECRET');
  const providedSecret =
    request.headers.get('x-webhook-secret') ??
    new URL(request.url).searchParams.get('secret');

  if (!expectedSecret || !providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return json({ error: 'Não autorizado' }, 401);
  }

  let payload: PluggyWebhookPayload;
  try {
    payload = (await request.json()) as PluggyWebhookPayload;
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }

  if (!isUuid(payload?.itemId)) {
    return json({ error: 'itemId inválido' }, 400);
  }

  if (!RELEVANT_EVENTS.includes(payload.event)) {
    return json({ ignored: payload.event });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Sem `.single()`: se alguém gravar o mesmo itemId na própria conta, isso
    // não pode derrubar o webhook do dono legítimo. O `syncConnection` confere
    // a posse de cada linha e só o dono real passa.
    const { data: connections, error: connectionsError } = await supabase
      .from('bank_connections')
      .select('id, user_id, pluggy_item_id')
      .eq('pluggy_item_id', payload.itemId);

    if (connectionsError) throw connectionsError;
    // 200 e não 404: não confirmamos para quem chama quais itemIds existem, e
    // o Pluggy não fica reenviando um evento que nunca vamos processar.
    if (!connections?.length) {
      return json({ ignored: 'unknown item' });
    }

    const pluggy = await PluggyClient.connect();
    let accountsSynced = 0;
    let transactionsInserted = 0;

    for (const connection of connections) {
      try {
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
      } catch (cause) {
        console.error('pluggy-webhook: conexão ignorada', connection.id, cause);
      }
    }

    return json({ event: payload.event, accountsSynced, transactionsInserted });
  } catch (cause) {
    console.error('pluggy-webhook falhou', cause);
    return errorResponse(cause);
  }
});
