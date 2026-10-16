import { Plus, Target } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { currentMonthKey } from '@/utils/analytics';
import { GoalForm, GoalRow, goalLabel, spentFor, useGoalEditor } from './goalParts';
import type { ExpenseGoal } from '@/services/goalsService';

/**
 * Cadastro das metas de gastos do mês, ao lado das categorias. Cada meta
 * mostra quanto já foi usado no mês atual (só despesas aprovadas).
 */
export function GoalsManager() {
  const { tree, byId, reload: reloadCategories } = useCategories();
  const editor = useGoalEditor();
  const { goals, draft } = editor;
  const { transactions } = useTransactions({ status: 'approved', from: `${currentMonthKey(new Date())}-01` });
  const expenses = transactions.filter((transaction) => transaction.amount < 0);

  // Recarrega as categorias ao abrir o formulário: uma criada agora no painel
  // ao lado já aparece nas opções.
  function open(goal?: ExpenseGoal) {
    void reloadCategories();
    editor.open(goal);
  }

  const creating = draft !== null && draft.goalId === null;

  return (
    <section className="panel lg:flex-1">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Metas do mês</h2>
          <p className="mt-1 text-sm text-ink-2">
            Teto de gastos por mês. Sem categoria, a meta vale para todas as despesas.
          </p>
        </div>
        {!creating && (
          <button type="button" className="btn-secondary shrink-0" onClick={() => open()}>
            <Plus className="h-4 w-4" aria-hidden />
            Nova meta
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 shrink-0 rounded-lg border border-line p-3">
          <GoalForm editor={editor} tree={tree} idPrefix="new-goal" />
        </div>
      )}

      {goals.length === 0 && !creating ? (
        <div className="flex flex-1 items-center justify-center py-6">
          <EmptyState
            icon={Target}
            title="Nenhuma meta definida"
            description="Escolha uma categoria (ou deixe todas) e o valor que os gastos do mês não devem ultrapassar."
            action={
              <button type="button" className="btn-primary mt-2" onClick={() => open()}>
                <Target className="h-4 w-4" aria-hidden />
                Definir meta
              </button>
            }
          />
        </div>
      ) : (
        <ul className="scroll-y mt-4 divide-y divide-line rounded-lg border border-line">
          {goals.map((goal) => (
            <li key={goal.id} className="px-3 py-3">
              {draft?.goalId === goal.id ? (
                <GoalForm editor={editor} tree={tree} idPrefix={`goal-${goal.id}`} />
              ) : (
                <GoalRow
                  label={goalLabel(goal, byId)}
                  spent={spentFor(goal, expenses)}
                  limit={goal.limit}
                  onEdit={() => open(goal)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
