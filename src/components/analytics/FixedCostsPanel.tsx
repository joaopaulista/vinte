import { AlertTriangle, CalendarClock, CheckCircle2, Info, Repeat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatCurrency } from '@/utils/format';
import type { FixedCost, FixedCostReport, FixedCostStatus } from '@/utils/fixedCosts';

const STATUS: Record<FixedCostStatus, { label: string; icon: LucideIcon; tone: string }> = {
  paid: { label: 'Pago', icon: CheckCircle2, tone: 'bg-success-surface text-success-ink' },
  upcoming: { label: 'A vencer', icon: CalendarClock, tone: 'bg-info-surface text-info-ink' },
  late: { label: 'Não apareceu', icon: AlertTriangle, tone: 'bg-warn-surface text-warn-ink' },
};

export function FixedCostsPanel({ report }: { report: FixedCostReport }) {
  const pagination = usePagination(report.items, 10);

  if (report.historyMonths < 2) {
    return (
      <div className="card">
        <EmptyState
          icon={Repeat}
          title="Pouco histórico para identificar custos fixos"
          description="São necessários pelo menos 2 meses completos de transações. Assim que houver, as contas recorrentes aparecem aqui."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breakeven report={report} />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Custos fixos identificados</h2>
          <p className="mt-1 text-sm text-ink-2">
            Gastos que se repetem ~1 vez por mês com valor estável, nos últimos {report.historyMonths}{' '}
            meses completos. Somam <strong className="text-ink">{formatCurrency(report.fixedMonthly)}</strong> por
            mês.
          </p>
        </div>

        {report.items.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-3">
            Nenhum gasto recorrente encontrado no período.
          </div>
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
                    <th className="px-4 py-3">Gasto</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3 text-center">Dia</th>
                    <th className="px-4 py-3 text-center">Frequência</th>
                    <th className="px-4 py-3">Este mês</th>
                    <th className="px-4 py-3 text-right">Por mês</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagination.pageItems.map((item) => (
                    <FixedCostRow key={item.key} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination state={pagination} noun="custos fixos" hideSizeSelector />
          </>
        )}
      </section>
    </div>
  );
}

function FixedCostRow({ item }: { item: FixedCost }) {
  const status = STATUS[item.status];
  const StatusIcon = status.icon;

  return (
    <tr className="hover:bg-surface-2">
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{item.name}</p>
        <p className="text-xs text-ink-3">
          {item.amountKind === 'fixed' ? 'Valor fixo' : 'Valor variável'}
          {item.confidence === 'medium' && ' · confiança média'}
        </p>
      </td>
      <td className="px-4 py-3 text-ink-2">
        {item.category ?? '—'}
        {item.subcategory && <span className="text-ink-3"> · {item.subcategory}</span>}
      </td>
      <td className="px-4 py-3 text-center text-ink-2 tabular-nums">~{item.typicalDay}</td>
      <td className="px-4 py-3 text-center text-ink-2 tabular-nums">
        {item.monthsPresent}/{item.historyMonths} meses
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>
          <StatusIcon className="h-3 w-3" aria-hidden />
          {status.label}
          {item.status === 'paid' && ` ${formatCurrency(item.paidThisMonth)}`}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
        {item.amountKind === 'variable' && '~'}
        {formatCurrency(item.monthly)}
      </td>
    </tr>
  );
}

function Breakeven({ report }: { report: FixedCostReport }) {
  const { breakeven, fixedMonthly, variableMonthly, averageIncome, incomeThisMonth } = report;
  const margin = averageIncome - breakeven;
  const safety = averageIncome > 0 ? margin / averageIncome : null;

  // Escala comum para barra e marcador: o maior entre renda e necessidade.
  const scale = Math.max(breakeven, averageIncome, 1);
  const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  const monthProgress = breakeven > 0 ? Math.min(1, incomeThisMonth / breakeven) : 0;

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-ink">Ponto de equilíbrio</h2>
      <p className="mt-1 text-sm text-ink-2">Quanto precisa entrar por mês para pagar todas as contas.</p>

      <p className="mt-4 text-3xl font-semibold text-ink tabular-nums">
        {formatCurrency(breakeven)}
        <span className="ml-2 text-base font-normal text-ink-2">por mês</span>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Custos fixos" value={formatCurrency(fixedMonthly)} hint="O mínimo para não atrasar nada" />
        <Tile label="Variáveis (média)" value={formatCurrency(variableMonthly)} hint="Mercado, lazer, avulsos" />
        <Tile label="Sua renda média" value={formatCurrency(averageIncome)} hint={`Últimos ${report.historyMonths} meses`} />
        <Tile
          label={margin >= 0 ? 'Sobra por mês' : 'Falta por mês'}
          value={formatCurrency(Math.abs(margin))}
          hint={safety === null ? 'Sem renda no período' : `${(Math.abs(safety) * 100).toFixed(0)}% da renda`}
          tone={margin >= 0 ? 'text-success-ink' : 'text-danger-ink'}
        />
      </div>

      {/* Barra: fixos + variáveis = necessidade; o traço marca a renda média */}
      <div className="mt-6">
        <div className="relative h-4 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="absolute inset-y-0 left-0 flex gap-0.5" style={{ width: pct(breakeven) }}>
            <div className="h-full bg-series-2" style={{ flex: fixedMonthly || 0.0001 }} />
            <div className="h-full bg-series-2/45" style={{ flex: variableMonthly || 0.0001 }} />
          </div>
          <div
            className="absolute inset-y-0 w-0.5 bg-ink"
            style={{ left: `calc(${pct(averageIncome)} - 2px)` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
          <Legend swatch="bg-series-2" label={`Fixos ${formatCurrency(fixedMonthly)}`} />
          <Legend swatch="bg-series-2/45" label={`Variáveis ${formatCurrency(variableMonthly)}`} />
          <Legend swatch="bg-ink w-0.5 rounded-none" label={`Renda média ${formatCurrency(averageIncome)}`} />
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-surface-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-ink">Neste mês</span>
          <span className="text-ink-2 tabular-nums">
            entrou {formatCurrency(incomeThisMonth)} de {formatCurrency(breakeven)} ({(monthProgress * 100).toFixed(0)}%)
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div className="h-full rounded-full bg-series-1" style={{ width: `${monthProgress * 100}%` }} />
        </div>
      </div>

      <p className="mt-4 flex gap-2 text-xs text-ink-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Estimativa com base nos últimos {report.historyMonths} meses completos. Respeita os filtros "Incluir
        pendentes" e "Ignorar transferências".
      </p>
    </section>
  );
}

function Tile({ label, value, hint, tone = 'text-ink' }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-ink-3">{hint}</p>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden />
      {label}
    </span>
  );
}
