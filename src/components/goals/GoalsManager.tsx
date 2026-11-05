import { Plus, ShieldAlert, Target } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { useCategories } from '@/hooks/useCategories';
import { GoalForm, GoalRow, goalLabel, progressFor, useGoalEditor } from './goalParts';
import type { ExpenseGoal, GoalKind } from '@/services/goalsService';
import type { TransactionWithRelations } from '@/types';

const SECTION = {
  target: {
    title: 'Metas do mês',
    hint: 'O que precisamos atingir. Sem categoria, a meta é o saldo do mês (quanto sobrou).',
    add: 'Nova meta',
    emptyTitle: 'Nenhuma meta definida',
    emptyText: 'Ex.: guardar R$ 2.000 no mês, investir R$ 500 ou receber R$ 3.000 de freelas.',
    icon: Target,
  },
  limit: {
    title: 'Limites do mês',
    hint: 'O que não podemos ultrapassar. Sem categoria, o limite vale para todas as despesas.',
    add: 'Novo limite',
    emptyTitle: 'Nenhum limite definido',
    emptyText: 'Escolha uma categoria (ou todas) e o valor que os gastos do mês não devem passar.',
    icon: ShieldAlert,
  },
} as const;

/**
 * Cadastro das metas (atingir) ou dos limites (não ultrapassar) do mês, ao
 * lado das categorias. Cada item mostra o andamento do mês atual (só
 * transações aprovadas).
 */
export function GoalsManager({
  kind,
  monthTransactions,
}: {
  kind: GoalKind;
  /** Transações aprovadas do mês atual. */
  monthTransactions: TransactionWithRelations[];
}) {
  const { tree, byId, reload: reloadCategories } = useCategories();
  const editor = useGoalEditor(kind);
  const { goals, draft } = editor;
  const copy = SECTION[kind];
  const Icon = copy.icon;

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
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Icon className="h-4 w-4 text-ink-3" aria-hidden />
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-ink-2">{copy.hint}</p>
        </div>
        {!creating && goals.length > 0 && (
          <button type="button" className="btn-secondary shrink-0" onClick={() => open()}>
            <Plus className="h-4 w-4" aria-hidden />
            {copy.add}
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 shrink-0 rounded-lg border border-line p-3">
          <GoalForm editor={editor} tree={tree} idPrefix={`new-${kind}`} />
        </div>
      )}

      {goals.length === 0 && !creating ? (
        <div className="flex flex-1 items-center justify-center py-4">
          <EmptyState
            icon={Icon}
            title={copy.emptyTitle}
            description={copy.emptyText}
            action={
              <button type="button" className="btn-primary mt-2" onClick={() => open()}>
                <Plus className="h-4 w-4" aria-hidden />
                {copy.add}
              </button>
            }
          />
        </div>
      ) : (
        goals.length > 0 && (
          <ul className="scroll-y mt-4 divide-y divide-line rounded-lg border border-line">
            {goals.map((goal) => (
              <li key={goal.id} className="px-3 py-3">
                {draft?.goalId === goal.id ? (
                  <GoalForm editor={editor} tree={tree} idPrefix={`${kind}-${goal.id}`} />
                ) : (
                  <GoalRow
                    label={goalLabel(goal, byId)}
                    kind={kind}
                    value={progressFor(goal, monthTransactions)}
                    amount={goal.limit}
                    onEdit={() => open(goal)}
                  />
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

