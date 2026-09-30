/**
 * Origens autorizadas a chamar as funções pelo navegador, separadas por vírgula:
 *   supabase secrets set ALLOWED_ORIGINS=https://vinte.exemplo.com,http://localhost:5173
 * Sem a variável cai em '*', o que é aceitável porque toda chamada exige o JWT
 * do usuário — mas em produção prefira fixar a origem.
 */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(request?: Request): Record<string, string> {
  const base = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.length === 0) return { ...base, 'Access-Control-Allow-Origin': '*' };

  const origin = request?.headers.get('Origin') ?? '';
  return ALLOWED_ORIGINS.includes(origin)
    ? { ...base, 'Access-Control-Allow-Origin': origin }
    : base;
}

export function json(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

export function preflight(request: Request): Response {
  return new Response('ok', { headers: corsHeaders(request) });
}

/**
 * Erro que pode ser mostrado ao usuário como está. Qualquer outro erro vira
 * uma mensagem genérica — respostas do Pluggy e do Postgres podem trazer
 * detalhes internos (ids, SQL, corpo de resposta) que não devem vazar.
 */
export class PublicError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function errorResponse(cause: unknown, request?: Request): Response {
  if (cause instanceof PublicError) return json({ error: cause.message }, cause.status, request);
  return json({ error: 'Erro interno. Consulte os logs da função.' }, 500, request);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
