import { supabase, toError } from './supabaseClient';
import type { AccountOwner } from '@/types';

/** Cores dos responsáveis, na ordem em que são cadastrados. */
export const OWNER_COLORS = ['#3ccf9e', '#e8664f', '#6c8cff', '#f2b84b', '#b07cf0', '#2bb3c0'];

const OWNER_SELECT = 'id, user_id, name, color, created_at';

export async function fetchOwners(): Promise<AccountOwner[]> {
  const { data, error } = await supabase
    .from('account_owners')
    .select(OWNER_SELECT)
    .order('created_at', { ascending: true });
  if (error) throw toError(error);
  return (data ?? []) as AccountOwner[];
}

export async function createOwner(userId: string, name: string, color: string): Promise<AccountOwner> {
  const { data, error } = await supabase
    .from('account_owners')
    .insert({ user_id: userId, name, color })
    .select(OWNER_SELECT)
    .single();
  if (error) throw friendly(error);
  return data as AccountOwner;
}

export async function renameOwner(ownerId: string, name: string): Promise<void> {
  const { error } = await supabase.from('account_owners').update({ name }).eq('id', ownerId);
  if (error) throw friendly(error);
}

/** As contas dele ficam sem responsável (FK com `on delete set null`). */
export async function deleteOwner(ownerId: string): Promise<void> {
  const { error } = await supabase.from('account_owners').delete().eq('id', ownerId);
  if (error) throw toError(error);
}

export async function setAccountOwner(accountId: string, ownerId: string | null): Promise<void> {
  const { error } = await supabase.from('accounts').update({ owner_id: ownerId }).eq('id', accountId);
  if (error) throw toError(error);
}

function friendly(error: { code?: string; message: string }): Error {
  return new Error(error.code === '23505' ? 'Já existe um responsável com esse nome.' : error.message);
}
