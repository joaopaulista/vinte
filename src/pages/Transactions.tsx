import { useMemo, useState } from 'react';
import { ListOrdered, RotateCcw } from 'lucide-react';
import { TransactionFilters } from '@/components/transactions/TransactionFilters';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { reopenTransaction } from '@/services/transactionsService';
import { formatCurrency } from '@/utils/format';
import type { TransactionFilters as Filters } from '@/types';

const EMPTY_FILTERS: Filters = {
  status: 'all',
  categoryId: 'all',
  from: null,
  to: null,
  search: '',
};

export default function Transactions() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { transactions, loading, error, reload } = useTransactions(filters);
  const { tree } = useCategories();
  const { refreshPendingCount } = usePendingCount();
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const transaction of transactions) {
      if (transaction.amount >= 0) income += transaction.amount;
      else expense += Math.abs(transaction.amount);
    }
    return { income, expense, balance: income - expense };
  }, [transactions]);

  async function handleReopen(transactionId: string) {
    setReopeningId(transactionId);
    try {
      await reopenTransaction(transactionId);
      await Promise.all([reload(), refreshPendingCount()]);
    } finally {
      setReopeningId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Transações</h1>
        <p className="mt-1 text-sm text-ink-2">
          Todas as movimentações sincronizadas, em qualquer status.
        </p>
      </header>

      <TransactionFilters
        filters={filters}
        tree={tree}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
      ) : transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ListOrdered}
            title="Nenhuma transação encontrada"
            description="Ajuste os filtros ou sincronize uma conta bancária para começar."
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryTile label="Entradas no filtro" value={totals.income} tone="text-success-ink" />
            <SummaryTile label="Saídas no filtro" value={totals.expense} tone="text-ink" />
            <SummaryTile label="Resultado" value={totals.balance} tone="text-ink" />
          </div>

          <p className="text-sm text-ink-2">
            {transactions.length}{' '}
            {transactions.length === 1 ? 'transação encontrada' : 'transações encontradas'}
          </p>

          <TransactionsTable
            transactions={transactions}
            renderActions={(transaction) =>
              transaction.reconciliation_status === 'pending' ? null : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-ink disabled:opacity-50"
                  disabled={reopeningId === transaction.id}
                  onClick={() => void handleReopen(transaction.id)}
                  title="Devolver para a fila de conciliação"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Reabrir
                </button>
              )
            }
          />
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{formatCurrency(value)}</p>
    </div>
  );
}
