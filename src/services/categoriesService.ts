import { supabase } from './supabaseClient';
import type { Category, CategoryTree } from '@/types';

const CATEGORY_COLUMNS = 'id, user_id, parent_category_id, name, icon, color, created_at';

/** Traz as categorias padrão do sistema + as customizadas do usuário logado (RLS resolve o filtro). */
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

/** Monta a árvore pai → subcategorias a partir da lista plana. */
export function buildCategoryTree(categories: Category[]): CategoryTree[] {
  const parents = categories.filter((category) => category.parent_category_id === null);

  return parents
    .map<CategoryTree>((parent) => ({
      ...parent,
      children: categories
        .filter((category) => category.parent_category_id === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function createCategory(input: {
  userId: string;
  name: string;
  parentCategoryId?: string | null;
  color?: string | null;
  icon?: string | null;
}): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: input.userId,
      name: input.name,
      parent_category_id: input.parentCategoryId ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
    })
    .select(CATEGORY_COLUMNS)
    .single();

  if (error) throw error;
  return data as Category;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ name }).eq('id', id);

  if (error) throw error;
}

/**
 * Remove uma categoria sem uso (a RLS impede apagar as do sistema). As
 * subcategorias vão junto em cascata. Se houver transação usando, o banco
 * recusa (`on delete restrict`) — use `reassignAndDeleteCategory`.
 */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

/** Quantas transações usam a categoria (incluindo as subcategorias dela). */
export async function getCategoryUsage(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('category_usage', { target: id });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/**
 * Move as transações (e regras) para o destino e apaga a categoria, numa
 * transação só no banco. Devolve quantas transações foram movidas.
 */
export async function reassignAndDeleteCategory(input: {
  targetId: string;
  newCategoryId: string;
  newSubcategoryId: string | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc('reassign_and_delete_category', {
    target: input.targetId,
    new_category: input.newCategoryId,
    new_subcategory: input.newSubcategoryId,
  });
  if (error) throw error;
  return (data as number | null) ?? 0;
}
