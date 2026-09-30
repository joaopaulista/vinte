/**
 * Emite o token de curta duração que autoriza o widget Pluggy Connect no
 * navegador. É o único jeito de abrir o widget sem expor client id/secret.
 *
 *   supabase functions deploy pluggy-connect-token
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PluggyClient } from '../_shared/pluggy.ts';
import { errorResponse, json, preflight } from '../_shared/http.ts';

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

  try {
    const pluggy = await PluggyClient.connect();
    const accessToken = await pluggy.createConnectToken({
      clientUserId: userData.user.id,
      avoidDuplicates: true,
    });

    return json({ accessToken }, 200, request);
  } catch (cause) {
    console.error('pluggy-connect-token falhou', cause);
    return errorResponse(cause, request);
  }
});
