import { useMemo, useState } from 'react';
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
  PiggyBank,
  Scale,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AXIS_TICK, CHART_COLORS } from '@/components/dashboard/chartTheme';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
import { FixedCostsPanel } from '@/components/analytics/FixedCostsPanel';
import { analyzeFixedCosts } from '@/utils/fixedCosts';
import { useTransactions } from '@/hooks/useTransactions';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/common/Pagination';
import { formatCurrency, formatCurrencyCompact, formatMonthLabel, monthsAgo, toDateInputValue } from '@/utils/format';
import {
  billPaymentsByMonth,
  expensesByCategory,
  expensesByMerchant,
  expensesBySubcategory,
  inMonths,
  isTransfer,
  metricValue,
  monthlyMetric,
  periodKeys,
  summarize,
} from '@/utils/insights';
import type { Metric, RankedItem, Summary } from '@/utils/insights';

const PERIOD_OPTIONS = [3, 6, 12] as const;

const METRICS: {
  key: Metric;
  label: string;
  icon: LucideIcon;
  lowerIsBetter?: boolean;
}[] = [
  { key: 'expense', label: 'Despesas', icon: TrendingDown, lowerIsBetter: true },
  { key: 'income', label: 'Receitas', icon: TrendingUp },
  { key: 'balance', label: 'Saldo', icon: Scale },
  { key: 'savings', label: 'Taxa de poupança', icon: PiggyBank },
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

export default function Analytics() {
  const [period, setPeriod] = useState<(typeof PERIOD_OPTIONS)[number]>(6);
  const [includePending, setIncludePending] = useState(false);
  const [ignoreTransfers, setIgnoreTransfers] = useState(true);
  const [metric, setMetric] = useState<Metric>('expense');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [category, setCategory] = useState<{ id: string | null; name: string } | null>(null);
  const [tab, setTab] = useState<'overview' | 'fixed'>('overview');

  // Busca o dobro do período (para o período anterior de comparação) e no
  // mínimo 7 meses, que é o histórico da detecção de custos fixos.
  const { transactions, loading, error } = useTransactions({
    from: toDateInputValue(monthsAgo(Math.max(period * 2, 7) - 1)),
  });

  const view = useMemo(() => {
    const keys = periodKeys(period);

    const base = transactions.filter(
      (transaction) =>
        (transaction.reconciliation_status === 'approved' ||
          (includePending && transaction.reconciliation_status === 'pending')) &&
        !(ignoreTransfers && isTransfer(transaction)),
    );

    const byCategory = category
      ? base.filter((transaction) => (transaction.category?.id ?? null) === category.id)
      : base;

    const scopeKeys = selectedMonth ? [selectedMonth] : keys.current;
    const previousKeys = selectedMonth ? [previousMonthKey(selectedMonth)] : keys.previous;
    const scope = inMonths(byCategory, scopeKeys);

    return {
      // Faturas saem de `transactions` e não de `base`: são reprovadas de
      // propósito (para não contar em dobro), mas o gráfico precisa delas.
      bills: billPaymentsByMonth(transactions, keys.current),
      fixedCosts: analyzeFixedCosts(base),
      current: summarize(scope),
      previous: summarize(inMonths(byCategory, previousKeys)),
      monthly: monthlyMetric(inMonths(byCategory, keys.current), keys.current, metric),
      ranking: category ? expensesBySubcategory(scope) : expensesByCategory(inMonths(base, scopeKeys)),
      merchants: expensesByMerchant(scope),
      rows: [...scope].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)),
      comparisonLabel: selectedMonth ? 'vs. mês anterior' : `vs. ${period} meses anteriores`,
    };
  }, [transactions, period, includePending, ignoreTransfers, metric, selectedMonth, category]);

  const pagination = usePagination(view.rows, 20);

  if (loading) return <Spinner label="Calculando análises…" />;

  if (error) {
    return (
      <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
    );
  }

  const selectedMetric = METRICS.find((item) => item.key === metric)!;
  const hasFilters = selectedMonth !== null || category !== null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Análises</h1>
        <p className="mt-1 text-sm text-ink-2">
          Clique nos indicadores, nas barras e nas categorias para explorar os números.
        </p>
      </header>

      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Seções de análise">
        {(
          [
            ['overview', 'Visão geral'],
            ['fixed', 'Custos fixos e equilíbrio'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === key ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtros: uma linha só, acima de tudo que eles afetam */}
      <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
        {tab === 'overview' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-2">Período</span>
            <div className="flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Período">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={period === option}
                  onClick={() => {
                    setPeriod(option);
                    setSelectedMonth(null);
                  }}
                  className={`rounded-md px-3 py-1 text-sm transition ${
                    period === option ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {option} meses
                </button>
              ))}
            </div>
          </div>
        )}

        <Toggle checked={includePending} onChange={setIncludePending} label="Incluir pendentes" />
        <Toggle checked={ignoreTransfers} onChange={setIgnoreTransfers} label="Ignorar transferências" />

        {tab === 'overview' && hasFilters && (
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            {selectedMonth && (
              <FilterChip
                label={formatMonthLabel(`${selectedMonth}-01`)}
                onClear={() => setSelectedMonth(null)}
              />
            )}
            {category && <FilterChip label={category.name} onClear={() => setCategory(null)} />}
          </div>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BarChart3}
            title="Ainda não há dados para analisar"
            description="Concilie algumas transações e elas aparecem aqui."
          />
        </div>
      ) : tab === 'fixed' ? (
        <FixedCostsPanel report={view.fixedCosts} />
      ) : (
        <>
          {/* KPIs: clicar escolhe a métrica do gráfico de evolução */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Métrica do gráfico">
            {METRICS.map((item) => (
              <MetricKpi
                key={item.key}
                label={item.label}
                icon={item.icon}
                metric={item.key}
                current={view.current}
                previous={view.previous}
                lowerIsBetter={item.lowerIsBetter}
                selected={metric === item.key}
                comparisonLabel={view.comparisonLabel}
                onSelect={() => setMetric(item.key)}
              />
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MiniStat label="Lançamentos no recorte" value={String(view.current.count)} />
            <MiniStat label="Despesa média por lançamento" value={formatCurrency(view.current.averageExpense)} />
          </div>

          <section className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">
                {selectedMetric.label} por mês
                {category && <span className="font-normal text-ink-2"> · {category.name}</span>}
              </h2>
              <p className="text-xs text-ink-3">Clique num mês para filtrar a página</p>
            </div>
            <MonthlyChart
              data={view.monthly}
              metric={metric}
              selectedMonth={selectedMonth}
              onSelect={(key) => setSelectedMonth(key === selectedMonth ? null : key)}
            />
          </section>

          <BillsSection data={view.bills} />

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">
                  {category ? `Subcategorias de ${category.name}` : 'Despesas por categoria'}
                </h2>
                {category && (
                  <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setCategory(null)}>
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    Todas
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {category ? 'Gasto dentro da categoria escolhida.' : 'Clique numa categoria para abrir as subcategorias.'}
              </p>
              <RankingChart
                data={view.ranking}
                onSelect={
                  category
                    ? undefined
                    : (item) => item.id !== null && setCategory({ id: item.id, name: item.name })
                }
              />
            </section>

            <section className="card p-5">
              <h2 className="text-base font-semibold text-ink">Onde mais gastei</h2>
              <p className="mt-1 text-xs text-ink-3">Estabelecimentos agrupados pela descrição.</p>
              <RankingChart data={view.merchants} />
            </section>
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">Transações do recorte</h2>
            {view.rows.length === 0 ? (
              <div className="card p-6 text-center text-sm text-ink-3">Nenhuma transação neste recorte.</div>
            ) : (
              <>
                <TransactionsTable transactions={pagination.pageItems} />
                <Pagination state={pagination} noun="transações" />
              </>
            )}
          </section>
        </>
      )}
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

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pr-1 pl-3 text-xs font-medium text-ink">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-0.5 text-ink-3 hover:text-ink"
        aria-label={`Remover filtro ${label}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
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
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  metric: Metric;
  current: Summary;
  previous: Summary;
  lowerIsBetter?: boolean;
  selected: boolean;
  comparisonLabel: string;
  onSelect: () => void;
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
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`card p-5 text-left transition ${
        selected
          ? 'border-accent bg-surface-2 outline-2 outline-accent'
          : 'hover:border-ink-3'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        <Icon className="h-4 w-4 text-ink-3" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">{formatMetric(metric, value)}</p>
      <Delta value={delta} unit={metric === 'savings' ? 'p.p.' : '%'} lowerIsBetter={lowerIsBetter} label={comparisonLabel} />
    </button>
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
    return <p className="mt-1 text-xs text-ink-3">sem base de comparação</p>;
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
      <span className="font-normal text-ink-3">{label}</span>
    </p>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex items-center justify-between px-5 py-3">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="text-base font-semibold text-ink tabular-nums">{value}</span>
    </div>
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
    <ResponsiveContainer width="100%" height={280}>
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
                <p className="mb-1 font-semibold text-ink capitalize">{label}</p>
                <p className="font-medium text-ink tabular-nums">
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
}: {
  data: RankedItem[];
  onSelect?: (item: RankedItem) => void;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-3">Sem despesas neste recorte.</p>;
  }

  const height = Math.max(200, data.length * 34 + 24);

  return (
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
                <p className="font-medium text-ink tabular-nums">{formatCurrency(item.total)}</p>
                <p className="text-ink-3">{(item.share * 100).toFixed(1)}% das despesas</p>
                {onSelect && item.id && <p className="mt-1 text-ink-3">Clique para ver subcategorias</p>}
              </div>
            ) : null;
          }}
        />
        <Bar
          dataKey="total"
          fill={CHART_COLORS.single}
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
  );
}

function BillsSection({ data }: { data: { key: string; label: string; value: number }[] }) {
  const paid = data.filter((point) => point.value > 0);
  const total = paid.reduce((sum, point) => sum + point.value, 0);
  const average = paid.length ? total / paid.length : 0;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Faturas pagas por mês</h2>
        {paid.length > 0 && (
          <p className="text-sm text-ink-2 tabular-nums">
            Total {formatCurrency(total)} · média {formatCurrency(average)}/mês
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-3">
        Pagamentos de fatura do cartão. Ficam fora das despesas para não contar em dobro: o gasto já
        entra em cada compra do cartão.
      </p>

      {paid.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">Nenhum pagamento de fatura no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
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
                    <p className="mb-1 font-semibold text-ink capitalize">{label}</p>
                    <p className="font-medium text-ink tabular-nums">
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
      )}
    </section>
  );
}
