import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  Minus,
  Percent,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AXIS_TICK, CHART_COLORS } from '@/components/dashboard/chartTheme';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
import { FixedCostsPanel } from '@/components/analytics/FixedCostsPanel';
import { CardForecastPanel } from '@/components/analytics/CardForecastPanel';
import { buildCardForecast } from '@/utils/cardForecast';
import { analyzeFixedCosts } from '@/utils/fixedCosts';
import { useTransactions } from '@/hooks/useTransactions';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/common/Pagination';
import { PageHeader } from '@/components/common/PageHeader';
import { FiltersPopover } from '@/components/common/FiltersPopover';
import { formatCurrency, formatCurrencyCompact, formatMonthLabel, monthsAgo, toDateInputValue } from '@/utils/format';
import { currentMonthKey, lastMonthKeys } from '@/utils/analytics';
import {
  billPaymentsByMonth,
  expensesByCategory,
  expensesByMerchant,
  expensesBySubcategory,
  incomeByCategory,
  inMonths,
  isTransfer,
  metricValue,
  monthlyMetric,
  periodKeys,
  summarize,
} from '@/utils/insights';
import type { Metric, RankedItem, Summary } from '@/utils/insights';

/** Período em meses: o padrão compara o mês atual com o anterior. */
const DEFAULT_PERIOD = 1;
const MAX_PERIOD = 24;
/** O gráfico de evolução mostra pelo menos este número de meses, mesmo com período curto. */
const MIN_CHART_MONTHS = 6;

const METRICS: {
  key: Metric;
  label: string;
  icon: LucideIcon;
  lowerIsBetter?: boolean;
}[] = [
  { key: 'expense', label: 'Despesas', icon: TrendingDown, lowerIsBetter: true },
  { key: 'income', label: 'Receitas', icon: TrendingUp },
  { key: 'balance', label: 'Saldo', icon: Scale },
];

function formatMetric(metric: Metric, value: number | null): string {
  if (value === null) return '—';
  if (metric === 'savings') return `${(value * 100).toFixed(0)}%`;
  return formatCurrency(value);
}

function previousMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

type Tab = 'overview' | 'gastos' | 'transacoes' | 'fixed' | 'forecast';

// A página não rola: cada aba mostra o que cabe numa tela. Por isso a antiga
// "Visão geral" foi dividida em três (indicadores, gastos e a lista).
const TABS: [Tab, string][] = [
  ['overview', 'Visão geral'],
  ['gastos', 'Gastos e faturas'],
  ['transacoes', 'Transações'],
  ['fixed', 'Custos fixos e equilíbrio'],
  ['forecast', 'Contas a pagar'],
];

/** Nomes curtos para caber as abas numa tela de celular. */
const SHORT_TAB_LABELS: Record<Tab, string> = {
  overview: 'Geral',
  gastos: 'Gastos',
  transacoes: 'Lista',
  fixed: 'Fixos',
  forecast: 'A pagar',
};

/** Abas que usam o recorte de período, mês e categoria. */
const PERIOD_TABS: Tab[] = ['overview', 'gastos', 'transacoes'];

const METRIC_KEYS = METRICS.map((item) => item.key);

function monthDay(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}

export default function Analytics() {
  // Aba, período, mês, categoria e métrica ficam no endereço: recarregar a
  // página ou usar "Voltar" devolve a pessoa exatamente onde ela estava.
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some(([key]) => key === params.get('aba')) ? (params.get('aba') as Tab) : 'overview';
  const periodParam = Number(params.get('periodo'));
  const period =
    Number.isInteger(periodParam) && periodParam >= 1 && periodParam <= MAX_PERIOD ? periodParam : DEFAULT_PERIOD;
  const metric: Metric = METRIC_KEYS.includes(params.get('metrica') as Metric)
    ? (params.get('metrica') as Metric)
    : 'expense';
  const selectedMonth = params.get('mes');
  const categoryId = params.get('categoria');
  // Subcategoria só vale junto com a categoria dela.
  const subcategoryId = categoryId ? params.get('subcategoria') : null;
  const [includePending, setIncludePending] = useState(false);
  const [ignoreTransfers, setIgnoreTransfers] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Ir para uma aba à direita faz o conteúdo entrar pela direita, e vice-versa.
  const tabIndex = TABS.findIndex(([key]) => key === tab);
  const previousTabIndex = useRef(tabIndex);
  const tabDirection = tabIndex >= previousTabIndex.current ? 'animate-from-right' : 'animate-from-left';
  useEffect(() => {
    previousTabIndex.current = tabIndex;
  }, [tabIndex]);

  const update = (changes: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    // Trocar de aba entra no histórico ("Voltar" funciona); filtros não.
    setParams(next, { replace: !push });
  };

  // Busca o dobro do período (para o período anterior de comparação) e no
  // mínimo 7 meses: histórico da detecção de custos fixos e do gráfico
  // (6 meses, mais o anterior do mês mais antigo, caso ele seja clicado).
  const { transactions, loading, error } = useTransactions({
    from: toDateInputValue(monthsAgo(Math.max(period * 2, MIN_CHART_MONTHS + 1) - 1)),
  });

  const view = useMemo(() => {
    const today = new Date();
    const day = today.getDate();
    const thisMonth = currentMonthKey(today);
    const keys = periodKeys(period);
    // Com período curto o gráfico ainda mostra a tendência dos últimos meses.
    const chartKeys = period >= MIN_CHART_MONTHS ? keys.current : lastMonthKeys(MIN_CHART_MONTHS, today);

    const base = transactions.filter(
      (transaction) =>
        (transaction.reconciliation_status === 'approved' ||
          (includePending && transaction.reconciliation_status === 'pending')) &&
        !(ignoreTransfers && isTransfer(transaction)),
    );

    const categoryName =
      categoryId === null
        ? null
        : (base.find((transaction) => transaction.category?.id === categoryId)?.category?.name ?? 'Categoria');
    const subcategoryName =
      subcategoryId === null
        ? null
        : (base.find((transaction) => transaction.subcategory?.id === subcategoryId)?.subcategory?.name ??
          'Subcategoria');
    const byCategory = base.filter(
      (transaction) =>
        (!categoryId || transaction.category?.id === categoryId) &&
        (!subcategoryId || transaction.subcategory?.id === subcategoryId),
    );

    const scopeKeys = selectedMonth ? [selectedMonth] : keys.current;
    const previousKeys = selectedMonth ? [previousMonthKey(selectedMonth)] : keys.previous;
    const scope = inMonths(byCategory, scopeKeys);

    // Comparação justa: se o recorte termina no mês atual (que está pela
    // metade), o último mês do período anterior também é cortado no mesmo
    // dia. Sem isso, "3 dias de outubro" perderia sempre para "setembro inteiro".
    const partial = scopeKeys[scopeKeys.length - 1] === thisMonth;
    const lastPrevious = previousKeys[previousKeys.length - 1];
    const previousScope = inMonths(byCategory, previousKeys).filter(
      (transaction) =>
        !partial ||
        !transaction.transaction_date.startsWith(lastPrevious) ||
        monthDay(transaction.transaction_date) <= day,
    );

    const label = (key: string) => formatMonthLabel(`${key}-01`);
    const range = (list: string[]) =>
      list.length === 1 ? label(list[0]) : `${label(list[0])} – ${label(list[list.length - 1])}`;

    // Opções dos campos Mês, Categoria e Subcategoria (alternativa ao clique no gráfico).
    const categoryOptions = new Map<string, string>();
    const subcategoryOptions = new Map<string, string>();
    for (const transaction of inMonths(base, [...new Set([...chartKeys, ...keys.current])])) {
      if (transaction.amount >= 0 || !transaction.category) continue;
      categoryOptions.set(transaction.category.id, transaction.category.name);
      if (transaction.category.id === categoryId && transaction.subcategory) {
        subcategoryOptions.set(transaction.subcategory.id, transaction.subcategory.name);
      }
    }
    const sortOptions = (options: Map<string, string>) =>
      [...options.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      // Faturas saem de `transactions` e não de `base`: são reprovadas de
      // propósito (para não contar em dobro), mas o gráfico precisa delas.
      bills: billPaymentsByMonth(transactions, keys.current),
      forecast: buildCardForecast(transactions),
      fixedCosts: analyzeFixedCosts(base),
      current: summarize(scope),
      previous: summarize(previousScope),
      monthly: monthlyMetric(inMonths(byCategory, chartKeys), chartKeys, metric),
      ranking: categoryId ? expensesBySubcategory(scope) : expensesByCategory(inMonths(base, scopeKeys)),
      // Receitas não seguem o filtro de categoria: as opções dele são de despesas.
      incomeRanking: incomeByCategory(inMonths(base, scopeKeys)),
      merchants: expensesByMerchant(scope),
      rows: [...scope].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)),
      categoryName,
      subcategoryName,
      // Nome curto do recorte filtrado, para frases como "Despesas em Compras".
      filterName: subcategoryName ? `${categoryName} › ${subcategoryName}` : categoryName,
      monthOptions: chartKeys.map((key) => ({ key, label: label(key) })),
      categoryOptions: sortOptions(categoryOptions),
      subcategoryOptions: sortOptions(subcategoryOptions),
      scopeLabel: `${range(scopeKeys)}${partial ? ` (${label(thisMonth)} até o dia ${day})` : ''}`,
      comparisonLabel: `vs. ${range(previousKeys)}${partial ? ` (${label(lastPrevious)} até o dia ${day})` : ''}`,
    };
  }, [transactions, period, includePending, ignoreTransfers, metric, selectedMonth, categoryId, subcategoryId]);

  const pagination = usePagination(view.rows);

  if (loading) return <Spinner label="Calculando análises…" />;

  if (error) {
    return (
      <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
    );
  }

  const selectedMetric = METRICS.find((item) => item.key === metric)!;
  const usesPeriod = PERIOD_TABS.includes(tab);
  const hasScopeFilters = period !== DEFAULT_PERIOD || Boolean(selectedMonth || categoryId || subcategoryId);
  const activeFilters =
    (usesPeriod
      ? Number(period !== DEFAULT_PERIOD) + Number(Boolean(selectedMonth)) + Number(Boolean(categoryId)) +
        Number(Boolean(subcategoryId))
      : 0) +
    Number(includePending) +
    Number(!ignoreTransfers);

  return (
    <div className="page">
      <PageHeader
        title="Análises"
        description="Escolha um indicador para ver a evolução dele mês a mês. Clicar nas barras dos gráficos também filtra a página."
        actions={
          // A previsão do cartão não usa nenhum filtro.
          tab !== 'forecast' && (
            <FiltersPopover id="filtros-analises" open={filtersOpen} onOpenChange={setFiltersOpen} activeCount={activeFilters}>
              {usesPeriod && (
                <>
                  <label className="block">
                    <span className="label">Período (meses)</span>
                    <PeriodInput
                      value={period}
                      onChange={(value) =>
                        update({ periodo: value === DEFAULT_PERIOD ? null : String(value), mes: null })
                      }
                    />
                    <span className="mt-1 block text-xs text-ink-3">
                      {period === 1
                        ? 'Compara o mês atual com o mês anterior.'
                        : `Compara os últimos ${period} meses com os ${period} anteriores.`}
                    </span>
                  </label>
                  <label className="block">
                    <span className="label">Mês</span>
                    <select
                      className="field py-1.5"
                      value={selectedMonth ?? ''}
                      onChange={(event) => update({ mes: event.target.value || null })}
                    >
                      <option value="">Todo o período</option>
                      {view.monthOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block min-w-0">
                      <span className="label">Categoria</span>
                      <select
                        className="field py-1.5"
                        value={categoryId ?? ''}
                        // Trocar a categoria invalida a subcategoria escolhida antes.
                        onChange={(event) => update({ categoria: event.target.value || null, subcategoria: null })}
                      >
                        <option value="">Todas</option>
                        {view.categoryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block min-w-0">
                      <span className="label">Subcategoria</span>
                      <select
                        className="field py-1.5"
                        value={subcategoryId ?? ''}
                        disabled={!categoryId || view.subcategoryOptions.length === 0}
                        onChange={(event) => update({ subcategoria: event.target.value || null })}
                      >
                        <option value="">Todas</option>
                        {view.subcategoryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-2">
                <Toggle checked={includePending} onChange={setIncludePending} label="Incluir pendentes" />
                <Toggle checked={ignoreTransfers} onChange={setIgnoreTransfers} label="Ignorar transferências" />
              </div>
              {usesPeriod && hasScopeFilters && (
                <button
                  type="button"
                  className="btn-secondary min-h-8 w-full py-1 text-xs"
                  onClick={() => update({ periodo: null, mes: null, categoria: null, subcategoria: null })}
                >
                  Limpar filtros
                </button>
              )}
            </FiltersPopover>
          )
        }
      />

      <TabList active={tab} onChange={(next) => update({ aba: next === 'overview' ? null : next }, true)} />

      <div
        key={tab}
        id={`painel-${tab}`}
        role="tabpanel"
        aria-labelledby={`aba-${tab}`}
        className={`page-fill ${tabDirection}`}
      >
        {/* O recorte em uso fica sempre à vista, mesmo com os filtros recolhidos. */}
        {usesPeriod && (
          <p className="shrink-0 text-sm text-ink-2">
            Mostrando <span className="font-medium text-ink">{view.scopeLabel}</span>
            {view.filterName && (
              <>
                {' '}
                em <span className="font-medium text-ink">{view.filterName}</span>
              </>
            )}
            <span className="text-ink-3"> {view.comparisonLabel}</span>
            {' · '}
            {includePending ? 'aprovadas e pendentes' : 'só aprovadas'}
            {ignoreTransfers ? ' · sem transferências' : ''}
            {hasScopeFilters && (
              <>
                {' · '}
                <button
                  type="button"
                  className="font-medium text-ink underline underline-offset-4 hover:text-accent"
                  onClick={() => update({ periodo: null, mes: null, categoria: null, subcategoria: null })}
                >
                  Limpar filtros
                </button>
              </>
            )}
          </p>
        )}

        {transactions.length === 0 ? (
          <div className="card page-fill justify-center">
            <EmptyState
              icon={BarChart3}
              title="Ainda não há dados para analisar"
              description="Concilie algumas transações e elas aparecem aqui."
            />
          </div>
        ) : tab === 'fixed' ? (
          <FixedCostsPanel report={view.fixedCosts} />
        ) : tab === 'forecast' ? (
          <CardForecastPanel forecast={view.forecast} />
        ) : tab === 'gastos' ? (
          <div className="page-grid lg:grid-cols-2 lg:grid-rows-1">
            <section className="panel">
              <h2 className="shrink-0 text-sm font-semibold text-ink">Onde mais gastei</h2>
              <p className="shrink-0 text-xs text-ink-2">Estabelecimentos agrupados pela descrição.</p>
              <div className="scroll-y">
                <RankingChart data={view.merchants} />
              </div>
            </section>
            <BillsSection data={view.bills} />
          </div>
        ) : tab === 'transacoes' ? (
          view.rows.length === 0 ? (
            <div className="card p-6 text-center text-sm text-ink-2">Nenhuma transação neste recorte.</div>
          ) : (
            <>
              <TransactionsTable transactions={pagination.pageItems} />
              <Pagination state={pagination} noun="transações" />
            </>
          )
        ) : (
          <>
            {/* Indicadores: escolher um troca a métrica do gráfico de evolução */}
            <div className="grid shrink-0 gap-4 xl:grid-cols-4">
              <RadioCards
                className="xl:col-span-3"
                label="Métrica do gráfico"
                value={metric}
                onChange={(next) => update({ metrica: next === 'expense' ? null : next })}
                items={METRICS.map((item) => ({
                  key: item.key,
                  render: (selected: boolean) => (
                    <MetricKpi
                      label={item.label}
                      icon={item.icon}
                      metric={item.key}
                      current={view.current}
                      previous={view.previous}
                      lowerIsBetter={item.lowerIsBetter}
                      selected={selected}
                      comparisonLabel={view.comparisonLabel}
                    />
                  ),
                }))}
              />
              <ExpenseChangeKpi
                current={view.current.expense}
                previous={view.previous.expense}
                filterName={view.filterName}
                comparisonLabel={view.comparisonLabel}
              />
              <p className="text-xs text-ink-2 xl:col-span-4">
                {view.current.count} {view.current.count === 1 ? 'lançamento' : 'lançamentos'} no recorte · despesa
                média de {formatCurrency(view.current.averageExpense)} por lançamento
              </p>
            </div>

            <div className="page-grid lg:grid-cols-5 lg:grid-rows-1">
              <section className="panel lg:col-span-3">
                <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    {selectedMetric.label} por mês
                    {view.categoryName && <span className="font-normal text-ink-2"> · {view.categoryName}</span>}
                  </h2>
                  <p className="text-xs text-ink-2">Clique num mês para filtrar a página</p>
                </div>
                <div className="chart-box">
                  <MonthlyChart
                    data={view.monthly}
                    metric={metric}
                    selectedMonth={selectedMonth}
                    onSelect={(key) => update({ mes: key === selectedMonth ? null : key })}
                  />
                </div>
              </section>

              <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:min-h-0">
                <section className="panel lg:flex-1">
                  <h2 className="shrink-0 text-sm font-semibold text-ink">Receitas por categoria</h2>
                  <p className="shrink-0 text-xs text-ink-2">De onde veio o dinheiro que entrou.</p>
                  <div className="scroll-y">
                    <RankingChart data={view.incomeRanking} side="income" />
                  </div>
                </section>

                <section className="panel lg:flex-1">
                  <div className="flex shrink-0 items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">
                      {view.categoryName ? `Subcategorias de ${view.categoryName}` : 'Despesas por categoria'}
                    </h2>
                    {categoryId && (
                      <button
                        type="button"
                        className="btn-secondary min-h-8 px-2.5 py-1 text-xs"
                        onClick={() => update({ categoria: null, subcategoria: null })}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                        Todas
                      </button>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-ink-2">
                    {categoryId
                      ? subcategoryId
                        ? 'Gasto na subcategoria escolhida.'
                        : 'Clique numa subcategoria para filtrar a página.'
                      : 'Clique numa categoria para abrir as subcategorias.'}
                  </p>
                  <div className="scroll-y">
                    <RankingChart
                      data={view.ranking}
                      onSelect={
                        subcategoryId
                          ? undefined
                          : (item) =>
                              item.id !== null &&
                              update(categoryId ? { subcategoria: item.id } : { categoria: item.id, subcategoria: null })
                      }
                    />
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Abas com setas ←/→, Home e End (padrão WAI-ARIA de abas). */
function TabList({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Mede a aba ativa para o sublinhado deslizar até ela (e acompanhar
  // mudanças de largura, como a tela girando no celular).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const button = list.querySelector<HTMLElement>(`#aba-${active}`);
      if (button) setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex(([key]) => key === active);
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const nextIndex = keys[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    onChange(TABS[nextIndex][0]);
    document.getElementById(`aba-${TABS[nextIndex][0]}`)?.focus();
  }

  return (
    <div
      ref={listRef}
      className="relative flex gap-1 overflow-x-auto border-b border-line"
      role="tablist"
      aria-label="Seções de análise"
      onKeyDown={onKeyDown}
    >
      {TABS.map(([key, label]) => (
        <button
          key={key}
          id={`aba-${key}`}
          type="button"
          role="tab"
          aria-selected={active === key}
          aria-controls={`painel-${key}`}
          tabIndex={active === key ? 0 : -1}
          onClick={() => onChange(key)}
          className={`min-h-11 shrink-0 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 ${
            active === key ? 'text-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <span className="sm:hidden">{SHORT_TAB_LABELS[key]}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
      {indicator && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 rounded-full bg-accent transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
    </div>
  );
}

/** Setas trocam a opção selecionada e levam o foco junto (padrão WAI-ARIA de radio). */
function arrowSelect<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  values: T[],
  current: T,
  onChange: (value: T) => void,
) {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!forward && !backward) return;
  event.preventDefault();
  const step = forward ? 1 : -1;
  const next = values[(values.indexOf(current) + step + values.length) % values.length];
  onChange(next);
  event.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
}

function RadioCards<T extends string>({
  label,
  value,
  onChange,
  items,
  className = '',
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: { key: T; render: (selected: boolean) => ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={`grid gap-4 sm:grid-cols-3 ${className}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => arrowSelect(event, items.map((item) => item.key), value, onChange)}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="radio"
          aria-checked={value === item.key}
          tabIndex={value === item.key ? 0 : -1}
          data-value={item.key}
          onClick={() => onChange(item.key)}
          className="rounded-xl text-left"
        >
          {item.render(value === item.key)}
        </button>
      ))}
    </div>
  );
}

/** Número de meses. Aplica ao sair do campo ou com Enter, para não recalcular a cada tecla. */
function PeriodInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const parsed = Math.round(Number(draft));
    const next = Number.isFinite(parsed) ? Math.min(MAX_PERIOD, Math.max(1, parsed)) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <input
      type="number"
      className="field py-1.5"
      min={1}
      max={MAX_PERIOD}
      step={1}
      inputMode="numeric"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

/**
 * As despesas do recorte (período, categoria e subcategoria filtrados)
 * subiram, ficaram iguais ou caíram em relação ao período anterior?
 */
function ExpenseChangeKpi({
  current,
  previous,
  filterName,
  comparisonLabel,
}: {
  current: number;
  previous: number;
  filterName: string | null;
  comparisonLabel: string;
}) {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const isFlat = change !== null && Math.abs(change) < 0.5;
  const verdict =
    change === null ? 'Sem base de comparação' : isFlat ? 'Manteve' : change > 0 ? 'Aumentou' : 'Diminuiu';
  // Despesa subindo é ruim, caindo é bom.
  const tone =
    change === null || isFlat ? 'text-ink' : change > 0 ? 'text-danger-ink' : 'text-success-ink';
  const Icon = change === null || isFlat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="card h-full p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-ink-2" title={filterName ?? undefined}>
          Variação das despesas{filterName ? ` · ${filterName}` : ''}
        </p>
        <Percent className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      </div>
      <p className={`mt-1.5 flex items-center gap-1 text-2xl font-semibold num ${tone}`}>
        {change !== null && <Icon className="h-5 w-5" aria-hidden />}
        {change === null ? '—' : `${change > 0 ? '+' : change < 0 && !isFlat ? '−' : ''}${Math.abs(change).toFixed(isFlat ? 0 : 1).replace('.', ',')}%`}
      </p>
      {/* Os períodos comparados ficam no título (passe o mouse) e na linha "Mostrando…". */}
      <p className="mt-1 text-xs text-ink-2" title={comparisonLabel}>
        <span className={`font-medium ${tone}`}>{verdict}</span>
        {change !== null && (
          <span className="tabular-nums">
            {' · '}
            {formatCurrency(current)} vs. {formatCurrency(previous)}
          </span>
        )}
      </p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--vinte-accent)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function MetricKpi({
  label,
  icon: Icon,
  metric,
  current,
  previous,
  lowerIsBetter = false,
  selected,
  comparisonLabel,
}: {
  label: string;
  icon: LucideIcon;
  metric: Metric;
  current: Summary;
  previous: Summary;
  lowerIsBetter?: boolean;
  selected: boolean;
  comparisonLabel: string;
}) {
  const value = metricValue(current, metric);
  const before = metricValue(previous, metric);

  // Poupança compara em pontos percentuais; o resto em variação percentual.
  let delta: number | null = null;
  if (value !== null && before !== null) {
    if (metric === 'savings') delta = (value - before) * 100;
    else if (before !== 0) delta = ((value - before) / Math.abs(before)) * 100;
  }

  return (
    // Selecionado = borda e contorno da marca, mesmo fundo dos outros: no
    // fundo mais escuro o texto vermelho de variação ficava sem contraste.
    <div
      className={`card h-full p-4 transition ${
        selected ? 'border-accent outline-2 outline-accent' : 'hover:border-ink-3'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        <Icon className="h-4 w-4 text-ink-3" aria-hidden />
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-ink num">{formatMetric(metric, value)}</p>
      <Delta value={delta} unit={metric === 'savings' ? 'p.p.' : '%'} lowerIsBetter={lowerIsBetter} label={comparisonLabel} />
    </div>
  );
}

function Delta({
  value,
  unit,
  lowerIsBetter,
  label,
}: {
  value: number | null;
  unit: string;
  lowerIsBetter: boolean;
  label: string;
}) {
  if (value === null) {
    return <p className="mt-1 text-xs text-ink-2">sem base de comparação</p>;
  }

  const isFlat = Math.abs(value) < 0.5;
  const isUp = value > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const tone = isFlat ? 'text-ink-3' : isGood ? 'text-success-ink' : 'text-danger-ink';

  return (
    <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {isFlat ? 'estável' : `${Math.abs(value).toFixed(0)} ${unit}`}
      <span className="font-normal text-ink-2">{label}</span>
    </p>
  );
}

function MonthlyChart({
  data,
  metric,
  selectedMonth,
  onSelect,
}: {
  data: { key: string; label: string; value: number | null }[];
  metric: Metric;
  selectedMonth: string | null;
  onSelect: (key: string) => void;
}) {
  const color = metric === 'expense' ? CHART_COLORS.expense : CHART_COLORS.income;
  const format = (value: number) =>
    metric === 'savings' ? `${value.toFixed(0)}%` : formatCurrencyCompact(value);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 20, right: 8, bottom: 0, left: 8 }}
        className="cursor-pointer"
        // Clique na coluna inteira do mês: barras pequenas seriam um alvo minúsculo.
        onClick={(state: { activeTooltipIndex?: number } | null) => {
          const index = state?.activeTooltipIndex;
          if (index !== undefined && data[index]) onSelect(data[index].key);
        }}
      >
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_COLORS.axis }} />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={format}
          domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
        />
        <ReferenceLine y={0} stroke={CHART_COLORS.axis} />
        <Tooltip
          cursor={{ fill: CHART_COLORS.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                <p className="mb-1 font-semibold text-ink first-letter:uppercase">{label}</p>
                <p className="font-medium text-ink num">
                  {payload[0].value === null || payload[0].value === undefined
                    ? '—'
                    : metric === 'savings'
                      ? `${Number(payload[0].value).toFixed(1)}%`
                      : formatCurrency(Number(payload[0].value))}
                </p>
                <p className="mt-1 text-ink-3">Clique para filtrar</p>
              </div>
            ) : null
          }
        />
        <Bar
          dataKey="value"
          radius={4}
          maxBarSize={36}
          isAnimationActive={false}
        >
          {data.map((point) => (
            <Cell
              key={point.key}
              fill={color}
              fillOpacity={selectedMonth && selectedMonth !== point.key ? 0.3 : 1}
            />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            fill={CHART_COLORS.muted}
            fontSize={11}
            formatter={(value: number | null) => (value === null ? '' : format(value))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RankingChart({
  data,
  onSelect,
  side = 'expense',
}: {
  data: RankedItem[];
  onSelect?: (item: RankedItem) => void;
  /** Receitas usam a cor de entrada (Menta); despesas, a série única. */
  side?: 'expense' | 'income';
}) {
  const noun = side === 'income' ? 'receitas' : 'despesas';
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-3">Sem {noun} neste recorte.</p>;
  }

  const height = Math.max(200, data.length * 34 + 24);
  const max = Math.max(...data.map((item) => item.total), 1);

  return (
    <>
      {/* Celular: lista com barras finas. O gráfico, com o nome no eixo,
          deixava as barras com poucos pixels numa tela estreita. */}
      <ul className="mt-3 space-y-2.5 sm:hidden">
        {data.map((item) => {
          const content = (
            <>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink">{item.name}</span>
                <span className="shrink-0 font-medium text-ink num">{formatCurrency(item.total)}</span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span
                  className="block h-full rounded-full bg-series-1"
                  style={{ width: `${Math.max(2, (item.total / max) * 100)}%` }}
                />
              </span>
              <span className="mt-0.5 block text-xs text-ink-2">{(item.share * 100).toFixed(1)}% das {noun}</span>
            </>
          );
          const clickable = onSelect && item.id !== null;
          return (
            <li key={item.id ?? item.name}>
              {clickable ? (
                <button
                  type="button"
                  className="block min-h-11 w-full rounded-md text-left"
                  onClick={() => onSelect(item)}
                >
                  {content}
                </button>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="hidden sm:block">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 96, bottom: 0, left: 8 }} barCategoryGap={6}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART_COLORS.axis }}
              width={150}
            />
            <Tooltip
              cursor={{ fill: CHART_COLORS.cursor }}
              content={({ active, payload }) => {
                const item = payload?.[0]?.payload as RankedItem | undefined;
                return active && item ? (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                    <p className="mb-1 font-semibold text-ink">{item.name}</p>
                    <p className="font-medium text-ink num">{formatCurrency(item.total)}</p>
                    <p className="text-ink-3">{(item.share * 100).toFixed(1)}% das {noun}</p>
                    {onSelect && item.id && <p className="mt-1 text-ink-3">Clique para ver subcategorias</p>}
                  </div>
                ) : null;
              }}
            />
            <Bar
              dataKey="total"
              fill={side === 'income' ? CHART_COLORS.income : CHART_COLORS.single}
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              isAnimationActive={false}
              cursor={onSelect ? 'pointer' : undefined}
              onClick={
                onSelect
                  ? (entry: { payload?: RankedItem }) => entry.payload && onSelect(entry.payload)
                  : undefined
              }
            >
              <LabelList
                dataKey="total"
                position="right"
                offset={8}
                fill={CHART_COLORS.muted}
                fontSize={12}
                formatter={(value: number) => formatCurrency(value)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function BillsSection({ data }: { data: { key: string; label: string; value: number }[] }) {
  const paid = data.filter((point) => point.value > 0);
  const total = paid.reduce((sum, point) => sum + point.value, 0);
  const average = paid.length ? total / paid.length : 0;

  return (
    <section className="panel">
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Faturas pagas por mês</h2>
        {paid.length > 0 && (
          <p className="text-sm text-ink-2 num">
            Total {formatCurrency(total)} · média {formatCurrency(average)}/mês
          </p>
        )}
      </div>
      <p className="mt-1 shrink-0 text-xs text-ink-3">
        Pagamentos de fatura do cartão. Ficam fora das despesas para não contar em dobro: o gasto já
        entra em cada compra do cartão.
      </p>

      {paid.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">Nenhum pagamento de fatura no período.</p>
      ) : (
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_COLORS.axis }} />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(value: number) => formatCurrencyCompact(value)}
              />
              <Tooltip
                cursor={{ fill: CHART_COLORS.cursor }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                      <p className="mb-1 font-semibold text-ink first-letter:uppercase">{label}</p>
                      <p className="font-medium text-ink num">
                        {formatCurrency(Number(payload[0].value))}
                      </p>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="value"
                name="Fatura paga"
                fill={CHART_COLORS.expense}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  fill={CHART_COLORS.muted}
                  fontSize={11}
                  formatter={(value: number) => (value > 0 ? formatCurrencyCompact(value) : '')}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
