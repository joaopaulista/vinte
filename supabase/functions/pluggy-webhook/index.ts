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
import { errorMessage, json } from '../_shared/http.ts';

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

  if (!payload.itemId) {
    return json({ error: 'itemId ausente' }, 400);
  }

  if (!RELEVANT_EVENTS.includes(payload.event)) {
    return json({ ignored: payload.event });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: connection, error: connectionError } = await supabase
      .from('bank_connections')
      .select('id, user_id, pluggy_item_id')
      .eq('pluggy_item_id', payload.itemId)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) {
      return json({ error: 'Conexão desconhecida para esse itemId' }, 404);
    }

    const pluggy = await PluggyClient.connect();
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

    return json({ event: payload.event, ...result });
  } catch (cause) {
    console.error('pluggy-webhook falhou', cause);
    return json({ error: errorMessage(cause) }, 500);
  }
});
