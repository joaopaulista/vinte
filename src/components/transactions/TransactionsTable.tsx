import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DescriptionLabel } from './DescriptionLabel';
import { formatCurrency, formatDate, formatMonthLabel } from '@/utils/format';
import type { TransactionWithRelations } from '@/types';

interface TransactionsTableProps {
  transactions: TransactionWithRelations[];
  /** Renderiza a coluna de ações à direita (usada para "reabrir" uma conciliação). */
  renderActions?: (transaction: TransactionWithRelations) => ReactNode;
}

export function TransactionsTable({ transactions, renderActions }: TransactionsTableProps) {
  return (
    // Rola por dentro (as duas direções) e o cabeçalho fica parado no topo.
    <div className="card overflow-auto overscroll-contain lg:min-h-0">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 z-10 bg-surface [&_th]:shadow-[inset_0_-1px_0_var(--vinte-line)]">
          <tr className="text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
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
              <td className="px-4 py-2.5 whitespace-nowrap text-ink-2 num">
                {formatDate(transaction.transaction_date)}
                {transaction.accounting_date.slice(0, 7) !== transaction.transaction_date.slice(0, 7) && (
                  <span className="block text-xs text-ink-3" title="Compra depois do fechamento: conta na fatura seguinte">
                    conta em {formatMonthLabel(transaction.accounting_date)}
                  </span>
                )}
              </td>
              <td className="max-w-md px-4 py-3">
                <DescriptionLabel
                  description={transaction.description}
                  installmentNumber={transaction.installment_number}
                  totalInstallments={transaction.total_installments}
                />
                {transaction.account?.name && (
                  <p className="text-xs text-ink-3">
                    {transaction.account.name}
                    {transaction.manual_entry && ' · lançamento manual'}
                    {transaction.bank_status === 'PENDING' && (
                      <span title="O banco ainda não liquidou: valor e data podem mudar na próxima sincronização">
                        {' · em aberto no banco'}
                      </span>
                    )}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5">
                {transaction.category ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--vinte-mint)' }}
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
              <td className="px-4 py-2.5">
                <StatusBadge status={transaction.reconciliation_status} />
              </td>
              <td
                className={`px-4 py-3 text-right font-medium whitespace-nowrap num ${
                  transaction.amount > 0 ? 'text-success-ink' : 'text-ink'
                }`}
              >
                {formatCurrency(transaction.amount)}
              </td>
              {renderActions && (
                <td className="px-4 py-2.5 text-right">{renderActions(transaction)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
