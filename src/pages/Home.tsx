import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, ChevronLeft, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { GoalCard } from '@/components/dashboard/GoalCard';
import { AnomalyCard } from '@/components/dashboard/AnomalyCard';import { CashflowChart } from '@/components/dashboard/CashflowChart';
import { CategorySpendingChart, categoryChartMinHeight } from '@/components/dashboard/CategorySpendingChart';
import { DescriptionLabel } from '@/components/transactions/DescriptionLabel';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import { Spinner } from '@/components/common/Spinner';
import { useTransactions } from '@/hooks/useTransactions';
import { usePagination } from '@/hooks/usePagination';
import { usePendingCount } from '@/contexts/PendingCountContext';
import {
  buildMonthlySeries,
  currentMonthKey,
  detectAnomalies,
  filterByMonth,
  sumExpensesByCategory,
} from '@/utils/analytics';
import { summarize } from '@/utils/insights';
import { formatCurrency, formatDate, monthsAgo, toDateInputValue } from '@/utils/format';

const MONTHS_IN_CHART = 6;

/** Rótulos que `sumExpensesByCategory` usa para o que não tem categoria e para o resto do ranking. */
const UNCATEGORIZED = 'Sem categoria';
const OTHERS = 'Outras';
const NO_SUBCATEGORY = 'Sem subcategoria';

const MONTH_LONG = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
const MONTH_SHORT = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
/** Ex.: "quarta-feira, 15 de outubro de 2026". */
const TODAY_LONG = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' });

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function Home() {
  const { pendingCount } = usePendingCount();
  // Categoria clicada no gráfico: o painel troca para as subcategorias dela;
  // clicar numa subcategoria mostra a lista de despesas.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  // Só transações aprovadas: pendentes e reprovadas distorceriam os números.
  const { transactions, loading, error } = useTransactions({
    status: 'approved',
    from: toDateInputValue(monthsAgo(MONTHS_IN_CHART)),
  });

  const metrics = useMemo(() => {
    const today = new Date();
    const day = today.getDate();
    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const previousKey = currentMonthKey(previousMonth);

    const monthTransactions = filterByMonth(transactions, currentMonthKey(today));
    // Mesmo intervalo de dias do mês anterior: no dia 3, compara 1–3 com 1–3.
    // Comparar 3 dias com um mês inteiro daria "↓100%" todo começo de mês.
    const previousSamePeriod = filterByMonth(transactions, previousKey).filter(
      (transaction) => Number(transaction.transaction_date.slice(8, 10)) <= day,
    );

    return {
      day,
      monthName: capitalize(MONTH_LONG.format(today)),
      comparisonLabel: `vs. ${day === 1 ? '1' : `1–${day}`} ${MONTH_SHORT.format(previousMonth).replace('.', '')}`,
      monthExpenses: monthTransactions.filter((transaction) => transaction.amount < 0),
      current: summarize(monthTransactions),
      previous: summarize(previousSamePeriod),
      hasPrevious: previousSamePeriod.length > 0,
      series: buildMonthlySeries(transactions, MONTHS_IN_CHART),
      byCategory: sumExpensesByCategory(monthTransactions),
      anomalies: detectAnomalies(transactions),
      monthCount: monthTransactions.length,
    };
  }, [transactions]);

  const categoryRows = useMemo(() => {
    if (!selectedCategory) return [];
    // "Outras" junta tudo o que ficou fora das categorias listadas no gráfico.
    const named = new Set(metrics.byCategory.map((item) => item.name).filter((name) => name !== OTHERS));
    return metrics.monthExpenses
      .filter((transaction) => {
        const name = transaction.category?.name ?? UNCATEGORIZED;
        return selectedCategory === OTHERS ? !named.has(name) : name === selectedCategory;
      })
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  }, [selectedCategory, metrics]);

  // "Outras" e "Sem categoria" não têm subcategorias: vão direto para a lista.
  const hasSubcategoryStep =
    selectedCategory !== null && selectedCategory !== OTHERS && selectedCategory !== UNCATEGORIZED;

  const bySubcategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of categoryRows) {
      const name = transaction.subcategory?.name ?? NO_SUBCATEGORY;
      totals.set(name, (totals.get(name) ?? 0) + Math.abs(transaction.amount));
    }
    return [...totals.entries()]
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
  }, [categoryRows]);

  const listRows = useMemo(
    () =>
      selectedSubcategory === null
        ? categoryRows
        : categoryRows.filter(
            (transaction) => (transaction.subcategory?.name ?? NO_SUBCATEGORY) === selectedSubcategory,
          ),
    [categoryRows, selectedSubcategory],
  );

  const categoryPagination = usePagination(listRows);
  const showingList = selectedCategory !== null && (!hasSubcategoryStep || selectedSubcategory !== null);

  function selectCategory(name: string | null) {
    setSelectedCategory(name);
    setSelectedSubcategory(null);
  }

  // Volta um nível: lista → subcategorias → categorias.
  function goBack() {
    if (selectedSubcategory !== null) setSelectedSubcategory(null);
    else selectCategory(null);
  }

  if (loading) return <Spinner label="Montando seu painel…" />;

  if (error) {
    return (
      <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
    );
  }

  const hasApprovedData = transactions.length > 0;
  const { current } = metrics;
  const categoryTotal = categoryRows.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const listTotal = listRows.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  return (
    <div className="page">
      <PageHeader
        title="Home"
        description={
          !hasApprovedData || metrics.monthCount === 0 ? (
            `${metrics.monthName} ainda não tem transações aprovadas.`
          ) : (
            // A resposta para "como está o mês?", antes de qualquer gráfico
            <p className="font-display text-lg font-medium leading-snug text-ink">
              {metrics.monthName}, até hoje: entraram{' '}
              <strong className="num font-semibold whitespace-nowrap text-success-ink">
                {formatCurrency(current.income)}
              </strong>{' '}
              e saíram <strong className="num font-semibold whitespace-nowrap">{formatCurrency(current.expense)}</strong>.{' '}
              {current.balance >= 0 ? (
                <>
                  Sobram{' '}
                  <strong className="num font-semibold whitespace-nowrap text-success-ink">
                    {formatCurrency(current.balance)}
                  </strong>
                  .
                </>
              ) : (
                <>
                  Por enquanto saiu{' '}
                  <strong className="num font-semibold whitespace-nowrap text-danger-ink">
                    {formatCurrency(Math.abs(current.balance))}
                  </strong>{' '}
                  a mais do que entrou.
                </>
              )}
            </p>
          )
        }
        actions={
          <div className="ml-auto flex flex-col items-end gap-2">
            {/* "Até hoje" no texto ao lado: a data diz qual é o hoje. */}
            <time dateTime={toDateInputValue(new Date())} className="text-sm font-medium text-ink-2 first-letter:uppercase">
              {TODAY_LONG.format(new Date())}
            </time>
            {pendingCount > 0 && (
              <Link
                to="/conciliacao"
                className="inline-flex items-center gap-2 rounded-lg border border-warn-ink/30 bg-warn-surface px-3 py-2 text-sm font-medium text-warn-ink transition hover:border-warn-ink/70"
                title="Pendentes ainda não entram nos números desta página"
              >
                {pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'} de conciliação
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        }
      />

      {!hasApprovedData ? (
        <div className="card page-fill justify-center">
          <EmptyState
            icon={BarChart3}
            title="Nada aprovado ainda"
            description="A Home usa apenas transações aprovadas. Passe pela tela de Conciliação para que os números apareçam aqui."
            action={
              <Link to="/conciliacao" className="btn-primary mt-2">
                Ir para a conciliação
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Receitas do mês"
              value={current.income}
              previousValue={metrics.hasPrevious ? metrics.previous.income : undefined}
              comparisonLabel={metrics.comparisonLabel}
              icon={TrendingUp}
            />
            <KpiCard
              label="Despesas do mês"
              value={current.expense}
              previousValue={metrics.hasPrevious ? metrics.previous.expense : undefined}
              comparisonLabel={metrics.comparisonLabel}
              icon={TrendingDown}
              lowerIsBetter
            />
            <KpiCard
              label="Saldo do mês"
              value={current.balance}
              previousValue={metrics.hasPrevious ? metrics.previous.balance : undefined}
              comparisonLabel={metrics.comparisonLabel}
              icon={Scale}
              hint="Receitas menos despesas"
            />
            <GoalCard expenses={metrics.monthExpenses} />
          </div>

          {/* Desktop: os dois gráficos lado a lado, ocupando o resto da tela. */}
          <div className="page-grid lg:grid-cols-2 lg:grid-rows-1">
            <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
              <section className="panel lg:flex-1">
                <PanelTitle title="Entradas e saídas por mês" hint={`Últimos ${MONTHS_IN_CHART} meses`} />
                <div className="chart-box">
                  <CashflowChart data={metrics.series} />
                </div>
              </section>
              <AnomalyCard anomalies={metrics.anomalies} className="lg:max-h-44 lg:shrink-0" />
            </div>

            <section className="panel">
              {selectedCategory && !showingList ? (
                <>
                  <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-ink">Subcategorias de {selectedCategory}</h2>
                      <p className="text-xs text-ink-2">
                        {formatCurrency(categoryTotal)} em {metrics.monthName} · clique numa subcategoria para ver as
                        despesas
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary min-h-8 shrink-0 px-2.5 py-1 text-xs"
                      onClick={goBack}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      Categorias
                    </button>
                  </div>
                  <div className="scroll-y lg:flex-1">
                    <div className="h-full" style={{ minHeight: categoryChartMinHeight(bySubcategory.length) }}>
                      <CategorySpendingChart data={bySubcategory} onSelect={setSelectedSubcategory} />
                    </div>
                  </div>
                </>
              ) : selectedCategory ? (
                <>
                  <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-ink">
                        {selectedSubcategory ? `${selectedCategory} › ${selectedSubcategory}` : selectedCategory}
                      </h2>
                      <p className="text-xs text-ink-2">
                        {listRows.length} {listRows.length === 1 ? 'despesa' : 'despesas'} em{' '}
                        {metrics.monthName} · {formatCurrency(listTotal)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary min-h-8 shrink-0 px-2.5 py-1 text-xs"
                      onClick={goBack}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      {selectedSubcategory ? 'Subcategorias' : 'Voltar ao gráfico'}
                    </button>
                  </div>
                  <ul className="scroll-y -mx-1 mb-2 divide-y divide-line px-1">
                    {categoryPagination.pageItems.map((transaction) => (
                      <li key={transaction.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <DescriptionLabel
                            description={transaction.description}
                            installmentNumber={transaction.installment_number}
                            totalInstallments={transaction.total_installments}
                            className="text-sm"
                          />
                          <p className="text-xs text-ink-2">
                            {formatDate(transaction.transaction_date)}
                            {transaction.subcategory ? ` · ${transaction.subcategory.name}` : ''}
                            {selectedCategory === OTHERS && transaction.category ? ` · ${transaction.category.name}` : ''}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-ink num">
                          {formatCurrency(transaction.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Pagination state={categoryPagination} noun="despesas" />
                </>
              ) : (
                <>
                  <PanelTitle
                    title="Despesas por categoria"
                    hint={`${metrics.monthName} até hoje · clique numa categoria para ver as subcategorias`}
                  />
                  {metrics.byCategory.length > 0 ? (
                    <div className="scroll-y lg:flex-1">
                      <div className="h-full" style={{ minHeight: categoryChartMinHeight(metrics.byCategory.length) }}>
                        <CategorySpendingChart data={metrics.byCategory} onSelect={selectCategory} />
                      </div>
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-ink-2">Nenhuma despesa aprovada neste mês.</p>
                  )}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function PanelTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2 shrink-0">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="text-xs text-ink-2">{hint}</p>
    </div>
  );
}
