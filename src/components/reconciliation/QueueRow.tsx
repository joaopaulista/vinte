import { Sparkles } from 'lucide-react';
import { DescriptionLabel } from '@/components/transactions/DescriptionLabel';
import { formatCurrency, formatDate } from '@/utils/format';
import type { TransactionWithRelations } from '@/types';

interface QueueRowProps {
  transaction: TransactionWithRelations;
  /** Categoria que já vem preenchida, ex.: "Moradia › Energia". */
  suggestedLabel: string | null;
  onSelect: () => void;
}

/** Uma transação da fila, compacta. Clicar traz para o destaque. */
export function QueueRow({ transaction, suggestedLabel, onSelect }: QueueRowProps) {
  const isIncome = transaction.amount > 0;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-14 w-full items-center gap-4 px-4 py-2.5 text-left transition hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <DescriptionLabel
            description={transaction.description}
            installmentNumber={transaction.installment_number}
            totalInstallments={transaction.total_installments}
            className="text-sm"
          />
          <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
            <span className="tabular-nums">{formatDate(transaction.transaction_date)}</span>
            {suggestedLabel && (
              <span className="inline-flex min-w-0 items-center gap-1 text-info-ink">
                <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{suggestedLabel}</span>
              </span>
            )}
          </span>
        </span>
        <span
          className={`shrink-0 text-sm font-semibold num ${isIncome ? 'text-success-ink' : 'text-ink'}`}
        >
          {formatCurrency(transaction.amount)}
        </span>
      </button>
    </li>
  );
}
