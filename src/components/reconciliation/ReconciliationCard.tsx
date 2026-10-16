import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { CategoryPicker } from '@/components/categories/CategoryPicker';
import { DescriptionLabel } from '@/components/transactions/DescriptionLabel';
import { formatCurrency, formatDate } from '@/utils/format';
import type { CategoryTree, TransactionWithRelations } from '@/types';
import type { CategorySuggestion } from '@/utils/categorySuggestion';

export interface Selection {
  categoryId: string | null;
  subcategoryId: string | null;
  /** De onde veio a categoria já preenchida, para explicar ao usuário. */
  source: 'history' | 'rule' | 'manual' | null;
}

/**
 * Categoria que já vem preenchida. O histórico vence a regra de texto: ele
 * sabe como VOCÊ classificou transações iguais, a regra só sabe o padrão
 * genérico. Categoria escolhida à mão (sem ser sugestão) nunca é trocada.
 */
export function initialSelection(
  transaction: TransactionWithRelations,
  suggestion: CategorySuggestion | null,
): Selection {
  const manuallySet = transaction.category_id !== null && !transaction.auto_categorized;
  if (suggestion && !manuallySet) {
    return { categoryId: suggestion.categoryId, subcategoryId: suggestion.subcategoryId, source: 'history' };
  }
  if (transaction.category_id) {
    return {
      categoryId: transaction.category_id,
      subcategoryId: transaction.subcategory_id,
      source: transaction.auto_categorized ? 'rule' : 'manual',
    };
  }
  return { categoryId: null, subcategoryId: null, source: null };
}

interface ReconciliationCardProps {
  transaction: TransactionWithRelations;
  tree: CategoryTree[];
  suggestion?: CategorySuggestion | null;
  /** Leva o foco à categoria ao montar (quando a transação vira a atual). */
  focusOnMount?: boolean;
  onApprove: (categoryId: string, subcategoryId: string | null, notes: string) => Promise<void>;
  onReject: (notes: string) => Promise<void>;
}

/**
 * A transação em conciliação agora, em destaque. É um formulário: Enter em
 * qualquer campo aprova. O botão principal já diz com qual categoria vai
 * aprovar, então a sugestão vira um toque só.
 */
export function ReconciliationCard({
  transaction,
  tree,
  suggestion = null,
  focusOnMount = false,
  onApprove,
  onReject,
}: ReconciliationCardProps) {
  const initial = initialSelection(transaction, suggestion);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [subcategoryId, setSubcategoryId] = useState(initial.subcategoryId);
  const [notes, setNotes] = useState(transaction.notes ?? '');
  const [showNotes, setShowNotes] = useState(Boolean(transaction.notes));
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Foco no card, não no campo de categoria: dentro do campo as letras
    // escolhem opções e o atalho "R" viraria a categoria "Receitas".
    if (focusOnMount) cardRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  const isIncome = transaction.amount > 0;
  const titleId = `${transaction.id}-title`;
  const errorId = `${transaction.id}-error`;
  const untouched = categoryId === initial.categoryId && subcategoryId === initial.subcategoryId;

  const category = tree.find((item) => item.id === categoryId);
  const subcategory = category?.children.find((item) => item.id === subcategoryId);
  const target = category ? [category.name, subcategory?.name].filter(Boolean).join(' › ') : null;

  async function run(action: 'approve' | 'reject') {
    if (busy) return;
    if (action === 'approve' && !categoryId) {
      setError('Escolha uma categoria antes de aprovar.');
      categoryRef.current?.focus();
      return;
    }

    setBusy(action);
    setError(null);
    try {
      if (action === 'approve') await onApprove(categoryId as string, subcategoryId, notes);
      else await onReject(notes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente de novo.');
      setBusy(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void run('approve');
  }

  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      data-active-card
      aria-labelledby={titleId}
      className="card animate-enter p-5 sm:p-6"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg">
              <DescriptionLabel
                description={transaction.description}
                installmentNumber={transaction.installment_number}
                totalInstallments={transaction.total_installments}
              />
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isIncome ? 'bg-success-surface text-success-ink' : 'bg-surface-2 text-ink-2'
                }`}
              >
                {isIncome ? (
                  <ArrowDownLeft className="h-3 w-3" aria-hidden />
                ) : (
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                )}
                {isIncome ? 'Entrada' : 'Saída'}
              </span>
              <span className="tabular-nums">{formatDate(transaction.transaction_date)}</span>
              {transaction.account?.name && (
                <>
                  <span className="text-ink-3" aria-hidden>
                    ·
                  </span>
                  <span className="truncate">{transaction.account.name}</span>
                </>
              )}
            </p>
          </div>
          <p
            className={`shrink-0 text-3xl font-semibold leading-none whitespace-nowrap num ${
              isIncome ? 'text-success-ink' : 'text-ink'
            }`}
          >
            {formatCurrency(transaction.amount)}
          </p>
        </div>

        {untouched && initial.source && initial.source !== 'manual' && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-info-surface px-2.5 py-1 text-xs font-medium text-info-ink">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {initial.source === 'history' && suggestion
              ? `Sugerido pelo seu histórico: ${suggestion.basis} ${
                  suggestion.basis === 1 ? 'lançamento parecido' : 'lançamentos parecidos'
                }${suggestion.share < 1 ? ` (${Math.round(suggestion.share * 100)}% nessa categoria)` : ''}`
              : 'Categoria sugerida por regra. Confira antes de aprovar.'}
          </p>
        )}

        <div className="mt-4">
          <CategoryPicker
            tree={tree}
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            disabled={busy !== null}
            idPrefix={transaction.id}
            invalid={error !== null && !categoryId}
            describedBy={errorId}
            categoryRef={categoryRef}
            onChange={(nextCategory, nextSubcategory) => {
              setCategoryId(nextCategory);
              setSubcategoryId(nextSubcategory);
              setError(null);
            }}
          />
        </div>

        {showNotes ? (
          <div className="mt-3">
            <label className="label" htmlFor={`${transaction.id}-notes`}>
              Observação
            </label>
            <input
              id={`${transaction.id}-notes`}
              className="field"
              value={notes}
              disabled={busy !== null}
              placeholder="Ex.: dividido com a Ana"
              autoFocus={!transaction.notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-medium text-ink-2 hover:text-ink"
            onClick={() => setShowNotes(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Adicionar observação
          </button>
        )}

        <p id={errorId} role="alert" className="mt-3 text-sm text-danger-ink empty:hidden">
          {error}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            id={`${transaction.id}-approve`}
            type="submit"
            className="btn-primary min-h-11 w-full sm:w-auto"
            disabled={busy !== null}
            aria-describedby={titleId}
          >
            {busy === 'approve' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            <span className="truncate">{target ? `Aprovar como ${target}` : 'Aprovar'}</span>
          </button>

          <button
            id={`${transaction.id}-reject`}
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 self-end rounded-lg px-3 text-sm font-medium text-ink-2 transition hover:bg-danger-surface hover:text-danger-ink disabled:opacity-50 sm:self-auto"
            disabled={busy !== null}
            onClick={() => void run('reject')}
            aria-describedby={titleId}
            title="Tira esta transação dos seus números. Dá para desfazer logo depois."
          >
            {busy === 'reject' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <X className="h-4 w-4" aria-hidden />
            )}
            Reprovar
          </button>
        </div>
      </form>
    </article>
  );
}
