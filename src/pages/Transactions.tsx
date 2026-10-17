import { useMemo, useState } from 'react';
import { ListOrdered, RotateCcw } from 'lucide-react';
import { TransactionFilters } from '@/components/transactions/TransactionFilters';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { Pagination } from '@/components/common/Pagination';
import { PageHeader } from '@/components/common/PageHeader';
import { usePagination } from '@/hooks/usePagination';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { reopenTransaction } from '@/services/transactionsService';
import { formatCurrency, formatDate } from '@/utils/format';
import type { TransactionFilters as Filters, TransactionWithRelations } from '@/types';

const EMPTY_FILTERS: Filters = {
  status: 'all',
  categoryId: 'all',
  from: null,
  to: null,
  search: '',
};

export default function Transactions() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // A busca é feita aqui, não no banco: precisa olhar campos que vêm de
  // outras tabelas (conta, categoria) e valores formatados ("231,45").
  const { search, ...serverFilters } = filters;
  const { transactions: fetched, loading, error, reload } = useTransactions(serverFilters);
  const transactions = useMemo(() => searchTransactions(fetched, search), [fetched, search]);
  const { tree } = useCategories();
  const { refreshPendingCount } = usePendingCount();
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const pagination = usePagination(transactions);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const transaction of transactions) {
      // Reprovada não entra na conta: é o jeito de tirar dos números um
      // lançamento que não é receita nem despesa de verdade (ex.: o
      // "pagamento recebido" da fatura no cartão).
      if (transaction.reconciliation_status === 'rejected') continue;
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
    <div className="page">
      <PageHeader
        title="Transações"
        description="Todas as movimentações sincronizadas, em qualquer status."
        actions={
          !loading &&
          !error &&
          transactions.length > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-right">
              <SummaryTile label="Entradas no filtro" value={totals.income} tone="text-success-ink" />
              <SummaryTile label="Saídas no filtro" value={totals.expense} tone="text-ink" />
              <SummaryTile label="Resultado" value={totals.balance} tone="text-ink" />
            </dl>
          )
        }
      />

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
        <div className="card page-fill justify-center">
          <EmptyState
            icon={ListOrdered}
            title="Nenhuma transação encontrada"
            description="Ajuste os filtros ou sincronize uma conta bancária para começar."
          />
        </div>
      ) : (
        <>
          <TransactionsTable
            transactions={pagination.pageItems}
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

          <Pagination state={pagination} noun="transações" />
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className={`text-lg font-semibold num ${tone}`}>{formatCurrency(value)}</dd>
    </div>
  );
}

const STATUS_LABELS = { pending: 'pendente', approved: 'aprovada', rejected: 'reprovada' } as const;

/** Minúsculas e sem acento: "transferencia" acha "Transferência". */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Cada palavra da busca precisa aparecer em algum campo da transação:
 * "edp 231" acha a conta de luz de R$ 231,45; "mercado aprovada" acha as
 * compras de mercado já aprovadas.
 */
function searchTransactions(transactions: TransactionWithRelations[], search: string) {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return transactions;
  return transactions.filter((transaction) => {
    const haystack = normalize(
      [
        transaction.description ?? '',
        transaction.notes ?? '',
        transaction.account?.name ?? '',
        transaction.category?.name ?? '',
        transaction.subcategory?.name ?? '',
        STATUS_LABELS[transaction.reconciliation_status],
        transaction.amount < 0 ? 'saida despesa' : 'entrada receita',
        formatCurrency(transaction.amount),
        String(Math.abs(transaction.amount)).replace('.', ','),
        String(Math.abs(transaction.amount)),
        formatDate(transaction.transaction_date),
        transaction.transaction_date,
        transaction.total_installments ? `${transaction.installment_number}/${transaction.total_installments}` : '',
      ].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
}
