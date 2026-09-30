import { supabase } from './supabaseClient';
import type { SyncResult } from '@/types';

export type { SyncResult };

/**
 * O erro do `functions.invoke` traz só "non-2xx status code"; a mensagem real
 * está no corpo da resposta, guardado em `context`.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;

  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // corpo vazio ou não-JSON: cai no fallback abaixo
    }
  }

  return error instanceof Error ? error.message : String(error);
}

/** Token de curta duração que autoriza o widget Pluggy Connect. */
export async function fetchConnectToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ accessToken: string }>(
    'pluggy-connect-token',
  );

  if (error) throw new Error(await describeFunctionError(error));
  if (!data?.accessToken) throw new Error('A função não devolveu um accessToken.');

  return data.accessToken;
}

/**
 * Dispara a sincronização. Com `itemId`, registra a conexão recém-criada no
 * widget antes de puxar o extrato.
 */
export async function syncTransactions(itemId?: string): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke<SyncResult>('sync-transactions', {
    body: itemId ? { itemId } : {},
  });

  if (error) throw new Error(await describeFunctionError(error));
  return data as SyncResult;
}
