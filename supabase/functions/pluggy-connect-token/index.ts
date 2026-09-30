/**
 * Emite o token de curta duração que autoriza o widget Pluggy Connect no
 * navegador. É o único jeito de abrir o widget sem expor client id/secret.
 *
 *   supabase functions deploy pluggy-connect-token
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PluggyClient } from '../_shared/pluggy.ts';
import { errorMessage, json, preflight } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight();

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return json({ error: 'Authorization header ausente' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: 'Sessão inválida' }, 401);
  }

  try {
    const pluggy = await PluggyClient.connect();
    const accessToken = await pluggy.createConnectToken({
      clientUserId: userData.user.id,
      avoidDuplicates: true,
    });

    return json({ accessToken });
  } catch (cause) {
    console.error('pluggy-connect-token falhou', cause);
    return json({ error: errorMessage(cause) }, 500);
  }
});
