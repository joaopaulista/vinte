import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * Metas e limites do mês. Ficam nos metadados do usuário no Supabase Auth:
 * acompanham a pessoa em qualquer aparelho sem precisar de tabela própria.
 *
 * São duas coisas diferentes:
 *  - **limite** (`kind: 'limit'`): teto que os gastos do mês não podem passar.
 *    Sem categoria, vale para todas as despesas; com categoria (e,
 *    opcionalmente, subcategoria), só para o que foi classificado nela.
 *  - **meta** (`kind: 'target'`): valor que precisamos atingir no mês. Sem
 *    categoria, é o saldo do mês (o quanto sobrou: receitas − despesas); com
 *    categoria, é o total movimentado nela (ex.: investir R$ 1.000, receber
 *    R$ 3.000 de freelas).
 */
const GOALS_KEY = 'expense_goals';
/** Formato antigo: um único teto geral. Lido para não perder metas já salvas. */
const LEGACY_GOAL_KEY = 'monthly_expense_goal';

export type GoalKind = 'limit' | 'target';

export interface ExpenseGoal {
  id: string;
  /** Ausente nas metas salvas antes da separação: todas eram limites. */
  kind: GoalKind;
  categoryId: string | null;
  subcategoryId: string | null;
  /** O valor: o teto (limite) ou o alvo (meta). Nome mantido por compatibilidade. */
  limit: number;
}

export function readGoals(user: User | null): ExpenseGoal[] {
  const stored = user?.user_metadata?.[GOALS_KEY];
  if (Array.isArray(stored)) {
    return stored
      .filter(
        (goal): goal is ExpenseGoal =>
          typeof goal?.id === 'string' && Number.isFinite(goal.limit) && goal.limit > 0,
      )
      .map((goal) => ({ ...goal, kind: goal.kind === 'target' ? 'target' : 'limit' }));
  }
  const legacy = Number(user?.user_metadata?.[LEGACY_GOAL_KEY]);
  return Number.isFinite(legacy) && legacy > 0
    ? [{ id: 'geral', kind: 'limit', categoryId: null, subcategoryId: null, limit: legacy }]
    : [];
}

export async function saveGoals(goals: ExpenseGoal[]): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { [GOALS_KEY]: goals, [LEGACY_GOAL_KEY]: null },
  });
  if (error) throw error;
}
