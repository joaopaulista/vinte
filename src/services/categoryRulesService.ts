import { supabase } from './supabaseClient';
import { derivePattern } from '@/utils/merchant';

/**
 * Reaplica as regras nas transações pendentes ainda sem categoria.
 * Devolve quantas foram classificadas.
 */
export async function applyRulesToPending(): Promise<number> {
  const { data, error } = await supabase.rpc('apply_rules_to_pending');
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/**
 * Guarda a escolha do usuário como regra, para lançamentos parecidos virem já
 * classificados. É o "tratar a correção como dado de treinamento" — só que com
 * regra legível, não com modelo opaco.
 *
 * Best-effort de propósito: se falhar, a conciliação em si já foi salva e não
 * faz sentido derrubar a tela por causa do aprendizado.
 */
export async function learnCategoryRule(input: {
  userId: string;
  description: string | null;
  categoryId: string;
  subcategoryId: string | null;
}): Promise<string | null> {
  const pattern = derivePattern(input.description);
  if (!pattern) return null;

  const { error } = await supabase.from('category_rules').upsert(
    {
      user_id: input.userId,
      pattern,
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
      priority: 10,
    },
    { onConflict: 'user_id,pattern' },
  );

  if (error) {
    console.warn('Não foi possível salvar a regra de categorização', error);
    return null;
  }

  return pattern;
}
