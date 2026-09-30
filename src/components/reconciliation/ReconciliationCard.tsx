import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, Sparkles, X } from 'lucide-react';
import { CategoryPicker } from '@/components/categories/CategoryPicker';
import { DescriptionLabel } from '@/components/transactions/DescriptionLabel';
import { formatCurrency, formatDate } from '@/utils/format';
import type { CategoryTree, TransactionWithRelations } from '@/types';
import type { CategorySuggestion } from '@/utils/categorySuggestion';

interface ReconciliationCardProps {
  transaction: TransactionWithRelations;
  tree: CategoryTree[];
  /** Sugestão aprendida com o histórico (transações parecidas já aprovadas). */
  suggestion?: CategorySuggestion | null;
  onApprove: (categoryId: string, subcategoryId: string | null, notes: string) => Promise<void>;
  onReject: (notes: string) => Promise<void>;
}

export function ReconciliationCard({
  transaction,
  tree,
  suggestion = null,
  onApprove,
  onReject,
}: ReconciliationCardProps) {
  // O histórico vence a regra de texto: ele sabe como VOCÊ classificou
  // transações iguais, a regra só sabe o padrão genérico. Categoria escolhida
  // à mão (sem ser sugestão) nunca é substituída.
  const manuallySet = transaction.category_id !== null && !transaction.auto_categorized;
  const useHistory = suggestion !== null && !manuallySet;
  const [categoryId, setCategoryId] = useState<string | null>(
    useHistory ? suggestion.categoryId : transaction.category_id,
  );
  const [subcategoryId, setSubcategoryId] = useState<string | null>(
    useHistory ? suggestion.subcategoryId : transaction.subcategory_id,
  );
  const [notes, setNotes] = useState(transaction.notes ?? '');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isIncome = transaction.amount > 0;

  async function run(action: 'approve' | 'reject') {
    if (action === 'approve' && !categoryId) {
      setError('Escolha uma categoria antes de aprovar.');
      return;
    }

    setBusy(action);
    setError(null);
    try {
      if (action === 'approve') {
        await onApprove(categoryId as string, subcategoryId, notes);
      } else {
        await onReject(notes);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
      setBusy(null);
    }
  }

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base">
            <DescriptionLabel
              description={transaction.description}
              installmentNumber={transaction.installment_number}
              totalInstallments={transaction.total_installments}
            />
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
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
          {useHistory ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-info-surface px-2 py-0.5 text-xs font-medium text-info-ink">
              <Sparkles className="h-3 w-3" aria-hidden />
              Sugerido pelo seu histórico: {suggestion.basis}{' '}
              {suggestion.basis === 1 ? 'lançamento parecido' : 'lançamentos parecidos'}
              {suggestion.share < 1 && ` (${Math.round(suggestion.share * 100)}% nessa categoria)`}
            </p>
          ) : (
            transaction.auto_categorized && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-info-surface px-2 py-0.5 text-xs font-medium text-info-ink">
                <Sparkles className="h-3 w-3" aria-hidden />
                Categoria sugerida — confira antes de aprovar
              </p>
            )
          )}
        </div>
        <span
          className={`shrink-0 text-lg font-semibold whitespace-nowrap tabular-nums ${
            isIncome ? 'text-success-ink' : 'text-ink'
          }`}
        >
          {formatCurrency(transaction.amount)}
        </span>
      </div>

      <div className="mt-4">
        <CategoryPicker
          tree={tree}
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          disabled={busy !== null}
          idPrefix={transaction.id}
          onChange={(nextCategory, nextSubcategory) => {
            setCategoryId(nextCategory);
            setSubcategoryId(nextSubcategory);
            setError(null);
          }}
        />
      </div>

      <div className="mt-3">
        <label className="label" htmlFor={`${transaction.id}-notes`}>
          Observação <span className="font-normal text-ink-3">(opcional)</span>
        </label>
        <input
          id={`${transaction.id}-notes`}
          className="field"
          value={notes}
          disabled={busy !== null}
          placeholder="Ex.: dividido com a Ana"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-danger-ink">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy !== null}
          onClick={() => void run('approve')}
        >
          {busy === 'approve' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
          Aprovar
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={busy !== null}
          onClick={() => void run('reject')}
        >
          {busy === 'reject' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <X className="h-4 w-4" aria-hidden />
          )}
          Reprovar
        </button>
      </div>
    </article>
  );
}
