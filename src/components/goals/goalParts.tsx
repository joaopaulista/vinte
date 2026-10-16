import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { readGoals, saveGoals } from '@/services/goalsService';
import type { ExpenseGoal } from '@/services/goalsService';
import { formatCurrency } from '@/utils/format';
import type { Category, CategoryTree, TransactionWithRelations } from '@/types';

/** O formulário aberto: uma meta nova (`goalId` nulo) ou a edição de uma existente. */
export interface GoalDraft {
  goalId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  limit: string;
}

/** Estado e ações de criar, editar e excluir metas, comum à Home e a Categorias. */
export function useGoalEditor() {
  const { user } = useAuth();
  const goals = readGoals(user);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(goal?: ExpenseGoal) {
    setDraft({
      goalId: goal?.id ?? null,
      categoryId: goal?.categoryId ?? null,
      subcategoryId: goal?.subcategoryId ?? null,
      limit: goal ? String(goal.limit).replace('.', ',') : '',
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
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a meta.');
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!draft) return;
    // Aceita "2.500,50", "1.500" e "2500.50".
    const normalized = draft.limit.trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const limit = Number(normalized);
    if (normalized === '' || !Number.isFinite(limit) || limit <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    const { categoryId, subcategoryId } = draft;
    // Uma meta por alvo: definir de novo a mesma categoria substitui a anterior.
    const sameTarget = goals.find(
      (goal) => goal.categoryId === categoryId && goal.subcategoryId === subcategoryId,
    );
    const id = draft.goalId ?? sameTarget?.id ?? crypto.randomUUID();
    const others = goals.filter((goal) => goal.id !== id && goal !== sameTarget);
    await persist([...others, { id, categoryId, subcategoryId, limit }]);
  }

  return {
    goals,
    draft,
    setDraft,
    saving,
    error,
    open,
    close: () => setDraft(null),
    submit,
    remove: (id: string) => persist(goals.filter((goal) => goal.id !== id)),
  };
}

export type GoalEditor = ReturnType<typeof useGoalEditor>;

/** Campos da meta: categoria e subcategoria opcionais e o teto do mês. */
export function GoalForm({
  editor,
  tree,
  idPrefix,
}: {
  editor: GoalEditor;
  tree: CategoryTree[];
  idPrefix: string;
}) {
  const { draft, setDraft, saving, error } = editor;
  if (!draft) return null;
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
            <option value="">Todas</option>
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
          Não ultrapassar (R$)
        </label>
        <input
          id={`${idPrefix}-limit`}
          className="field py-1.5"
          inputMode="decimal"
          placeholder="Ex.: 1.500"
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
          Salvar meta
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
            aria-label="Excluir meta"
            title="Excluir meta"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}

/** Uma meta com a barra de quanto já foi usado no mês. */
export function GoalRow({
  label,
  spent,
  limit,
  onEdit,
}: {
  label: string;
  spent: number;
  limit: number;
  /** Sem `onEdit`, a linha só mostra o andamento (como na Home). */
  onEdit?: () => void;
}) {
  const share = spent / limit;
  const over = spent > limit;
  const tone = over ? 'bg-danger' : share >= 0.8 ? 'bg-gold' : 'bg-success';

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
            aria-label={`Editar meta: ${label}`}
            title="Editar meta"
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
      <p className="text-sm font-semibold text-ink num">
        {formatCurrency(spent)}
        <span className="text-xs font-normal text-ink-2"> de {formatCurrency(limit)}</span>
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      <p className={`mt-0.5 text-xs ${over ? 'font-medium text-danger-ink' : 'text-ink-2'}`}>
        {over
          ? `Passou ${formatCurrency(spent - limit)} da meta`
          : `${(share * 100).toFixed(0)}% usado · restam ${formatCurrency(limit - spent)}`}
      </p>
    </div>
  );
}

export function goalLabel(goal: ExpenseGoal, byId: Map<string, Category>): string {
  if (!goal.categoryId) return 'Todas as despesas';
  const category = byId.get(goal.categoryId)?.name ?? 'Categoria removida';
  const subcategory = goal.subcategoryId ? byId.get(goal.subcategoryId)?.name : null;
  return subcategory ? `${category} › ${subcategory}` : category;
}

/** Quanto das despesas do mês cai dentro da meta. */
export function spentFor(goal: ExpenseGoal, expenses: TransactionWithRelations[]): number {
  return expenses
    .filter((transaction) =>
      goal.subcategoryId
        ? transaction.subcategory_id === goal.subcategoryId
        : goal.categoryId
          ? transaction.category_id === goal.categoryId
          : true,
    )
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
}
