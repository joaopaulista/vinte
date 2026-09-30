import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { CategoryPicker } from './CategoryPicker';
import { getCategoryUsage } from '@/services/categoriesService';
import type { Category, CategoryTree } from '@/types';

interface DeleteCategoryDialogProps {
  category: Category;
  tree: CategoryTree[];
  onCancel: () => void;
  /** Sem destino = categoria sem uso, pode apagar direto. */
  onConfirm: (destination: { categoryId: string; subcategoryId: string | null } | null) => Promise<void>;
}

/**
 * Trava de exclusão: se a categoria (ou alguma subcategoria dela) estiver em
 * uso, a exclusão só libera depois de escolher para onde vão as transações.
 */
export function DeleteCategoryDialog({ category, tree, onCancel, onConfirm }: DeleteCategoryDialogProps) {
  const [usage, setUsage] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isParent = category.parent_category_id === null;
  const children = isParent ? (tree.find((item) => item.id === category.id)?.children ?? []) : [];

  useEffect(() => {
    let cancelled = false;
    getCategoryUsage(category.id)
      .then((count) => !cancelled && setUsage(count))
      .catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      cancelled = true;
    };
  }, [category.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  // O destino não pode ser o que está sendo apagado.
  const destinations = useMemo(
    () =>
      tree
        .filter((item) => item.id !== category.id)
        .map((item) => ({
          ...item,
          children: item.children.filter((child) => child.id !== category.id),
        })),
    [tree, category.id],
  );

  const inUse = usage !== null && usage > 0;
  const canConfirm = usage !== null && (!inUse || categoryId !== null) && !busy;

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(inUse && categoryId ? { categoryId, subcategoryId } : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-category-title"
        className="card w-full max-w-lg p-5"
      >
        <h2 id="delete-category-title" className="flex items-center gap-2 text-base font-semibold text-ink">
          <Trash2 className="h-4 w-4" aria-hidden />
          Apagar {isParent ? 'categoria' : 'subcategoria'} “{category.name}”
        </h2>

        {usage === null && !error ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Verificando se está em uso…
          </p>
        ) : inUse ? (
          <>
            <div className="mt-4 flex gap-3 rounded-lg bg-warn-surface p-3 text-sm text-warn-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                <strong>
                  {usage} {usage === 1 ? 'transação usa' : 'transações usam'}
                </strong>{' '}
                {isParent && children.length > 0
                  ? `esta categoria ou uma das ${children.length} subcategorias dela`
                  : 'esta categoria'}
                . Escolha para onde {usage === 1 ? 'ela vai' : 'elas vão'} antes de apagar.
              </p>
            </div>

            <div className="mt-4">
              <CategoryPicker
                tree={destinations}
                categoryId={categoryId}
                subcategoryId={subcategoryId}
                disabled={busy}
                idPrefix="delete-destination"
                onChange={(nextCategory, nextSubcategory) => {
                  setCategoryId(nextCategory);
                  setSubcategoryId(nextSubcategory);
                }}
              />
            </div>
          </>
        ) : (
          usage === 0 && (
            <p className="mt-4 text-sm text-ink-2">
              Nenhuma transação usa {isParent ? 'esta categoria' : 'esta subcategoria'}.
              {isParent && children.length > 0 && ` As ${children.length} subcategorias dela também serão apagadas.`}
            </p>
          )
        )}

        {error && (
          <p className="mt-3 text-sm text-danger-ink" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={() => void handleConfirm()} disabled={!canConfirm}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {inUse ? 'Mover e apagar' : 'Apagar'}
          </button>
        </div>
      </div>
    </div>
  );
}
