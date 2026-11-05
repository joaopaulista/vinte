import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Sem as variáveis o app não consegue falar com o banco. Em vez de quebrar no
 * import, sinalizamos aqui e o App mostra uma tela explicando o que preencher.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/**
 * Os erros do Supabase são objetos simples, não `Error`: as telas, que fazem
 * `cause instanceof Error ? cause.message : 'Falha…'`, acabavam escondendo o
 * motivo. Aqui viram `Error` com a mensagem real.
 *
 * Coluna ou tabela inexistente quase sempre é migration que faltou rodar no
 * banco; nesse caso a mensagem diz o que fazer.
 */
export function toError(error: { message?: string; code?: string } | Error): Error {
  if (error instanceof Error) return error;
  const message = error.message ?? 'Erro desconhecido do banco';
  const missingSchema =
    error.code === '42703' || error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205' ||
    /does not exist|schema cache/i.test(message);
  return new Error(
    missingSchema
      ? `O banco ainda não tem as atualizações desta versão do VINTE. Rode no SQL Editor do Supabase as migrations de supabase/migrations que faltam (na ordem). Detalhe: ${message}`
      : message,
  );
}
