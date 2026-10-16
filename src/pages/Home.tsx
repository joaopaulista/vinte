import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { AnomalyCard } from '@/components/dashboard/AnomalyCard';
import { CashflowChart } from '@/components/dashboard/CashflowChart';
import { BalanceTrendChart } from '@/components/dashboard/BalanceTrendChart';
import { CategorySpendingChart } from '@/components/dashboard/CategorySpendingChart';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { useTransactions } from '@/hooks/useTransactions';
import { usePendingCount } from '@/contexts/PendingCountContext';
import {
  buildMonthlySeries,
  currentMonthKey,
  detectAnomalies,
  filterByMonth,
  lastMonthKeys,
  sumExpensesByCategory,
} from '@/utils/analytics';
import { formatCurrency, formatDate, monthsAgo, toDateInputValue } from '@/utils/format';

const MONTHS_IN_CHART = 6;

export default function Dashboard() {
  const { pendingCount } = usePendingCount();

  // O dashboard só olha para transações aprovadas — pendentes e reprovadas
  // ficariam distorcendo os KPIs.
  const { transactions, loading, error } = useTransactions({
    status: 'approved',
    from: toDateInputValue(monthsAgo(MONTHS_IN_CHART - 1)),
  });

  const metrics = useMemo(() => {
    const series = buildMonthlySeries(transactions, MONTHS_IN_CHART);
    const [previousKey, thisKey] = lastMonthKeys(2);
    const current = series.find((point) => point.key === thisKey);
    const previous = series.find((point) => point.key === previousKey);

    const monthTransactions = filterByMonth(transactions, currentMonthKey());

    return {
      series,
      current: current ?? { income: 0, expense: 0, balance: 0 },
      previous,
      byCategory: sumExpensesByCategory(monthTransactions),
      anomalies: detectAnomalies(transactions),
      topExpenses: [...monthTransactions]
        .filter((transaction) => transaction.amount < 0)
        .sort((a, b) => a.amount - b.amount)
        .slice(0, 5),
    };
  }, [transactions]);

  if (loading) return <Spinner label="Montando seu painel…" />;

  if (error) {
    return (
      <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
    );
  }

  const hasApprovedData = transactions.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">
          Números do mês corrente, considerando apenas transações aprovadas na conciliação.
        </p>
      </header>

      {pendingCount > 0 && (
        <Link
          to="/conciliacao"
          className="card flex items-center gap-3 border-warn-ink/30 bg-warn-surface p-4 text-sm text-warn-ink transition hover:bg-warn-surface"
        >
          <span className="font-medium">
            {pendingCount} {pendingCount === 1 ? 'transação pendente' : 'transações pendentes'} de
            conciliação
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium">
            Conciliar agora
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      )}

      {!hasApprovedData ? (
        <div className="card">
          <EmptyState
            icon={BarChart3}
            title="Nada aprovado ainda"
            description="O dashboard usa apenas transações aprovadas. Passe pela tela de Conciliação para que os números apareçam aqui."
            action={
              <Link to="/conciliacao" className="btn-primary mt-2">
                Ir para a conciliação
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              label="Receitas do mês"
              value={metrics.current.income}
              previousValue={metrics.previous?.income}
              icon={TrendingUp}
            />
            <KpiCard
              label="Despesas do mês"
              value={metrics.current.expense}
              previousValue={metrics.previous?.expense}
              icon={TrendingDown}
              lowerIsBetter
            />
            <KpiCard
              label="Saldo do mês"
              value={metrics.current.balance}
              previousValue={metrics.previous?.balance}
              icon={Scale}
              hint="Receitas menos despesas"
            />
          </div>

          <AnomalyCard anomalies={metrics.anomalies} />

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card p-5">
              <h2 className="text-base font-semibold text-ink">Entradas e saídas por mês</h2>
              <p className="mb-4 text-sm text-ink-2">Últimos {MONTHS_IN_CHART} meses.</p>
              <CashflowChart data={metrics.series} />
            </section>

            <section className="card p-5">
              <h2 className="text-base font-semibold text-ink">Tendência do saldo</h2>
              <p className="mb-4 text-sm text-ink-2">
                Receitas menos despesas, mês a mês. Abaixo da linha tracejada, o mês fechou no
                negativo.
              </p>
              <BalanceTrendChart data={metrics.series} />
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <section className="card p-5 xl:col-span-3">
              <h2 className="text-base font-semibold text-ink">Despesas por categoria</h2>
              <p className="mb-4 text-sm text-ink-2">Mês corrente.</p>
              {metrics.byCategory.length > 0 ? (
                <CategorySpendingChart data={metrics.byCategory} />
              ) : (
                <p className="py-8 text-center text-sm text-ink-3">
                  Nenhuma despesa aprovada neste mês.
                </p>
              )}
            </section>

            <section className="card p-5 xl:col-span-2">
              <h2 className="text-base font-semibold text-ink">Maiores despesas do mês</h2>
              <p className="mb-4 text-sm text-ink-2">Top 5.</p>
              {metrics.topExpenses.length > 0 ? (
                <ul className="divide-y divide-line">
                  {metrics.topExpenses.map((transaction) => (
                    <li key={transaction.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: transaction.category?.color ?? 'var(--vinte-ink-3)' }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {transaction.description ?? 'Sem descrição'}
                        </p>
                        <p className="text-xs text-ink-3">
                          {formatDate(transaction.transaction_date)}
                          {transaction.category ? ` · ${transaction.category.name}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-ink tabular-nums">
                        {formatCurrency(transaction.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-ink-3">
                  Nenhuma despesa aprovada neste mês.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
