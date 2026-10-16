import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * Metas de gastos do mês. Ficam nos metadados do usuário no Supabase Auth:
 * acompanham a pessoa em qualquer aparelho sem precisar de tabela própria.
 *
 * Cada meta é um teto que os gastos do mês não devem passar. Sem categoria,
 * vale para todas as despesas; com categoria (e, opcionalmente, subcategoria),
 * só para o que foi classificado nela.
 */
const GOALS_KEY = 'expense_goals';
/** Formato antigo: um único teto geral. Lido para não perder metas já salvas. */
const LEGACY_GOAL_KEY = 'monthly_expense_goal';

export interface ExpenseGoal {
  id: string;
  categoryId: string | null;
  subcategoryId: string | null;
  limit: number;
}

export function readGoals(user: User | null): ExpenseGoal[] {
  const stored = user?.user_metadata?.[GOALS_KEY];
  if (Array.isArray(stored)) {
    return stored.filter(
      (goal): goal is ExpenseGoal =>
        typeof goal?.id === 'string' && Number.isFinite(goal.limit) && goal.limit > 0,
    );
  }
  const legacy = Number(user?.user_metadata?.[LEGACY_GOAL_KEY]);
  return Number.isFinite(legacy) && legacy > 0
    ? [{ id: 'geral', categoryId: null, subcategoryId: null, limit: legacy }]
    : [];
}

export async function saveGoals(goals: ExpenseGoal[]): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { [GOALS_KEY]: goals, [LEGACY_GOAL_KEY]: null },
  });
  if (error) throw error;
}
