import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { readGoals, saveGoals } from '@/services/goalsService';
import type { ExpenseGoal, GoalKind } from '@/services/goalsService';
import { formatCurrency, parseMoney, toMoneyInput } from '@/utils/format';
import type { Category, CategoryTree, TransactionWithRelations } from '@/types';

/** O formulário aberto: um item novo (`goalId` nulo) ou a edição de um existente. */
export interface GoalDraft {
  goalId: string | null;
  kind: GoalKind;
  categoryId: string | null;
  subcategoryId: string | null;
  limit: string;
}

/** Textos que mudam entre meta (atingir) e limite (não ultrapassar). */
export const KIND_COPY = {
  limit: {
    singular: 'limite',
    field: 'Não ultrapassar (R$)',
    all: 'Todas as despesas',
    save: 'Salvar limite',
  },
  target: {
    singular: 'meta',
    field: 'Atingir (R$)',
    all: 'Saldo do mês (economia)',
    save: 'Salvar meta',
  },
} as const;

/** Estado e ações de criar, editar e excluir metas e limites de um tipo. */
export function useGoalEditor(kind: GoalKind) {
  const { user } = useAuth();
  const allGoals = readGoals(user);
  const goals = allGoals.filter((goal) => goal.kind === kind);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(goal?: ExpenseGoal) {
    setDraft({
      goalId: goal?.id ?? null,
      kind,
      categoryId: goal?.categoryId ?? null,
      subcategoryId: goal?.subcategoryId ?? null,
      limit: goal ? toMoneyInput(goal.limit).replace(/,00$/, '') : '',
    });
    setError(null);
  }

  async function persist(next: ExpenseGoal[]) {
    setSaving(true);
    setError(null);
    try {
      await saveGoals(next);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Não foi possível salvar o ${KIND_COPY[kind].singular}.`);
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!draft) return;
    const limit = parseMoney(draft.limit);
    if (limit === null || limit <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    const { categoryId, subcategoryId } = draft;
    // Um item por alvo e tipo: definir de novo a mesma categoria substitui o anterior.
    const sameTarget = goals.find(
      (goal) => goal.categoryId === categoryId && goal.subcategoryId === subcategoryId,
    );
    const id = draft.goalId ?? sameTarget?.id ?? crypto.randomUUID();
    const others = allGoals.filter((goal) => goal.id !== id && goal !== sameTarget);
    await persist([...others, { id, kind, categoryId, subcategoryId, limit }]);
  }

  return {
    kind,
    goals,
    draft,
    setDraft,
    saving,
    error,
    open,
    close: () => setDraft(null),
    submit,
    remove: (id: string) => persist(allGoals.filter((goal) => goal.id !== id)),
  };
}

export type GoalEditor = ReturnType<typeof useGoalEditor>;

/** Campos: categoria e subcategoria opcionais e o valor do mês. */
export function GoalForm({
  editor,
  tree,
  idPrefix,
}: {
  editor: GoalEditor;
  tree: CategoryTree[];
  idPrefix: string;
}) {
  const { draft, setDraft, saving, error, kind } = editor;
  if (!draft) return null;
  const copy = KIND_COPY[kind];
  const subcategories = tree.find((category) => category.id === draft.categoryId)?.children ?? [];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void editor.submit();
  }

  return (
    <form className="grid gap-2" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <label className="mb-0.5 block text-xs text-ink-2" htmlFor={`${idPrefix}-category`}>
            Categoria
          </label>
          <select
            id={`${idPrefix}-category`}
            className="field py-1.5"
            value={draft.categoryId ?? ''}
            disabled={saving}
            autoFocus
            // Trocar a categoria invalida a subcategoria escolhida antes.
            onChange={(event) => setDraft({ ...draft, categoryId: event.target.value || null, subcategoryId: null })}
          >
            <option value="">{kind === 'target' ? 'Nenhuma: saldo do mês' : 'Todas'}</option>
            {tree.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="mb-0.5 block text-xs text-ink-2" htmlFor={`${idPrefix}-subcategory`}>
            Subcategoria
          </label>
          <select
            id={`${idPrefix}-subcategory`}
            className="field py-1.5"
            value={draft.subcategoryId ?? ''}
            disabled={saving || subcategories.length === 0}
            onChange={(event) => setDraft({ ...draft, subcategoryId: event.target.value || null })}
          >
            <option value="">Todas</option>
            {subcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-0.5 block text-xs text-ink-2" htmlFor={`${idPrefix}-limit`}>
          {copy.field}
        </label>
        <input
          id={`${idPrefix}-limit`}
          className="field py-1.5"
          inputMode="decimal"
          placeholder={kind === 'target' ? 'Ex.: 1.000' : 'Ex.: 1.500'}
          value={draft.limit}
          onChange={(event) => setDraft({ ...draft, limit: event.target.value })}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${idPrefix}-error` : undefined}
        />
      </div>

      {error && (
        <p id={`${idPrefix}-error`} className="text-xs text-danger-ink" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <button type="submit" className="btn-primary min-h-8 flex-1 px-3 py-1 text-xs" disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {copy.save}
        </button>
        <button type="button" className="btn-secondary min-h-8 px-3 py-1 text-xs" onClick={editor.close} disabled={saving}>
          Cancelar
        </button>
        {draft.goalId && (
          <button
            type="button"
            className="btn-secondary min-h-8 px-2 py-1 text-danger-ink"
            onClick={() => void editor.remove(draft.goalId as string)}
            disabled={saving}
            aria-label={`Excluir ${copy.singular}`}
            title={`Excluir ${copy.singular}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}

/** Um limite ou uma meta com a barra de andamento do mês. */
export function GoalRow({
  label,
  kind,
  value,
  amount,
  onEdit,
}: {
  label: string;
  kind: GoalKind;
  /** Quanto já foi gasto (limite) ou alcançado (meta). */
  value: number;
  /** O teto (limite) ou o alvo (meta). */
  amount: number;
  /** Sem `onEdit`, a linha só mostra o andamento (como na Home). */
  onEdit?: () => void;
}) {
  const share = Math.max(0, value) / amount;
  const isTarget = kind === 'target';
  const over = !isTarget && value > amount;
  const reached = isTarget && value >= amount;
  const tone = isTarget
    ? reached
      ? 'bg-success'
      : 'bg-mint/60'
    : over
      ? 'bg-danger'
      : share >= 0.8
        ? 'bg-gold'
        : 'bg-success';

  let status: string;
  if (isTarget) {
    status = reached
      ? value > amount
        ? `Meta atingida · ${formatCurrency(value - amount)} além`
        : 'Meta atingida'
      : `${(share * 100).toFixed(0)}% alcançado · faltam ${formatCurrency(amount - value)}`;
  } else {
    status = over
      ? `Passou ${formatCurrency(value - amount)} do limite`
      : `${(share * 100).toFixed(0)}% usado · restam ${formatCurrency(amount - value)}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-ink" title={label}>
          {label}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="-m-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            aria-label={`Editar ${KIND_COPY[kind].singular}: ${label}`}
            title={`Editar ${KIND_COPY[kind].singular}`}
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
      <p className="text-sm font-semibold text-ink num">
        {formatCurrency(value)}
        <span className="text-xs font-normal text-ink-2"> de {formatCurrency(amount)}</span>
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      <p
        className={`mt-0.5 text-xs ${
          over ? 'font-medium text-danger-ink' : reached ? 'font-medium text-success-ink' : 'text-ink-2'
        }`}
      >
        {status}
      </p>
    </div>
  );
}

export function goalLabel(goal: ExpenseGoal, byId: Map<string, Category>): string {
  if (!goal.categoryId) return KIND_COPY[goal.kind].all;
  const category = byId.get(goal.categoryId)?.name ?? 'Categoria removida';
  const subcategory = goal.subcategoryId ? byId.get(goal.subcategoryId)?.name : null;
  return subcategory ? `${category} › ${subcategory}` : category;
}

function inTarget(goal: ExpenseGoal, transaction: TransactionWithRelations): boolean {
  if (goal.subcategoryId) return transaction.subcategory_id === goal.subcategoryId;
  if (goal.categoryId) return transaction.category_id === goal.categoryId;
  return true;
}

/**
 * Andamento do mês a partir das transações aprovadas do mês:
 *  - limite: soma das despesas que caem nele;
 *  - meta sem categoria: saldo do mês (receitas − despesas);
 *  - meta com categoria: total movimentado na categoria, em valor absoluto
 *    (serve para "investir R$ 1.000" e para "receber R$ 3.000").
 */
export function progressFor(goal: ExpenseGoal, monthTransactions: TransactionWithRelations[]): number {
  if (goal.kind === 'limit') {
    return monthTransactions
      .filter((transaction) => transaction.amount < 0 && inTarget(goal, transaction))
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  }
  if (!goal.categoryId) {
    return monthTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  }
  return Math.abs(
    monthTransactions
      .filter((transaction) => inTarget(goal, transaction))
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  );
}
