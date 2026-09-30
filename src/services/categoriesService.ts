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
