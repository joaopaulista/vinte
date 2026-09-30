import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DescriptionLabel } from './DescriptionLabel';
import { formatCurrency, formatDate } from '@/utils/format';
import type { TransactionWithRelations } from '@/types';

interface TransactionsTableProps {
  transactions: TransactionWithRelations[];
  /** Renderiza a coluna de ações à direita (usada para "reabrir" uma conciliação). */
  renderActions?: (transaction: TransactionWithRelations) => ReactNode;
}

export function TransactionsTable({ transactions, renderActions }: TransactionsTableProps) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3">Categoria</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Valor</th>
            {renderActions && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-surface-2">
              <td className="px-4 py-3 whitespace-nowrap text-ink-2 tabular-nums">
                {formatDate(transaction.transaction_date)}
              </td>
              <td className="max-w-md px-4 py-3">
                <DescriptionLabel
                  description={transaction.description}
                  installmentNumber={transaction.installment_number}
                  totalInstallments={transaction.total_installments}
                />
                {transaction.account?.name && (
                  <p className="text-xs text-ink-3">{transaction.account.name}</p>
                )}
              </td>
              <td className="px-4 py-3">
                {transaction.category ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: transaction.category.color ?? 'var(--vinte-ink-3)' }}
                      aria-hidden
                    />
                    <span className="text-ink-2">
                      {transaction.category.name}
                      {transaction.subcategory && (
                        <span className="text-ink-3"> · {transaction.subcategory.name}</span>
                      )}
                    </span>
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={transaction.reconciliation_status} />
              </td>
              <td
                className={`px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums ${
                  transaction.amount > 0 ? 'text-success-ink' : 'text-ink'
                }`}
              >
                {formatCurrency(transaction.amount)}
              </td>
              {renderActions && (
                <td className="px-4 py-3 text-right">{renderActions(transaction)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
