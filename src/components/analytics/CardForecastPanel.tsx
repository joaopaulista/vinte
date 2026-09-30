import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CreditCard, Info } from 'lucide-react';
import { AXIS_TICK, CHART_COLORS } from '@/components/dashboard/chartTheme';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatCurrency, formatCurrencyCompact, formatMonthLabel } from '@/utils/format';
import type { CardForecast } from '@/utils/cardForecast';

export function CardForecastPanel({ forecast }: { forecast: CardForecast }) {
  const pagination = usePagination(forecast.purchases, 10);

  if (!forecast.hasCard) {
    return (
      <div className="card">
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão de crédito conectado"
          description="Conecte o cartão em Contas para ver a previsão das próximas faturas."
        />
      </div>
    );
  }

  const next = forecast.months[0];
  const nextTotal = next ? next.posted + next.projected : 0;

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Previsão das faturas</h2>
            <p className="mt-1 text-sm text-ink-2">
              O que já está lançado no cartão mais as parcelas que ainda vão entrar, mês a mês.
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-ink-2">Fatura deste mês</p>
              <p className="text-lg font-semibold text-ink tabular-nums">{formatCurrency(nextTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-2">Parcelas a vencer</p>
              <p className="text-lg font-semibold text-ink tabular-nums">
                {formatCurrency(forecast.remainingTotal)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={forecast.months} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const posted = Number(payload.find((item) => item.dataKey === 'posted')?.value ?? 0);
                  const projected = Number(payload.find((item) => item.dataKey === 'projected')?.value ?? 0);
                  return (
                    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                      <p className="mb-1 font-semibold text-ink first-letter:uppercase">{label}</p>
                      <TooltipRow color={CHART_COLORS.income} label="Já lançado" value={posted} />
                      <TooltipRow color={CHART_COLORS.expense} label="Parcelas previstas" value={projected} />
                      <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold text-ink">
                        <span>Total</span>
                        <span className="tabular-nums">{formatCurrency(posted + projected)}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={32}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: CHART_COLORS.muted }}
              />
              {/* Empilhadas com 2px de respiro entre os segmentos */}
              <Bar
                dataKey="posted"
                name="Já lançado"
                stackId="fatura"
                fill={CHART_COLORS.income}
                stroke={CHART_COLORS.surface}
                strokeWidth={2}
                maxBarSize={36}
                isAnimationActive={false}
              />
              <Bar
                dataKey="projected"
                name="Parcelas previstas"
                stackId="fatura"
                fill={CHART_COLORS.expense}
                stroke={CHART_COLORS.surface}
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-3 flex gap-2 text-xs text-ink-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          As parcelas previstas são projetadas a partir da última parcela que o banco mandou de cada
          compra. Compras da fatura em aberto só aparecem depois que o banco as confirma.
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Compras parceladas</h2>
          <p className="mt-1 text-sm text-ink-2">Em qual parcela cada compra está e quanto ainda falta.</p>
        </div>

        {forecast.purchases.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-3">
            Nenhuma compra parcelada em andamento.
          </div>
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
                    <th className="px-4 py-3">Compra</th>
                    <th className="px-4 py-3 text-center">Parcela</th>
                    <th className="px-4 py-3 text-right">Valor da parcela</th>
                    <th className="px-4 py-3 text-center">Faltam</th>
                    <th className="px-4 py-3">Última parcela</th>
                    <th className="px-4 py-3 text-right">A pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagination.pageItems.map((purchase) => (
                    <tr key={purchase.key} className="hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{purchase.name}</p>
                        {purchase.accountName && <p className="text-xs text-ink-3">{purchase.accountName}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2 tabular-nums">
                          {purchase.current}/{purchase.total}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-2 tabular-nums">
                        {formatCurrency(purchase.installmentValue)}
                      </td>
                      <td className="px-4 py-3 text-center text-ink-2 tabular-nums">
                        {purchase.remaining === 0 ? 'última' : purchase.remaining}
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {formatMonthLabel(`${purchase.lastMonth}-01`)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                        {formatCurrency(purchase.remainingTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination state={pagination} noun="compras" hideSizeSelector />
          </>
        )}
      </section>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <p className="flex items-center gap-2 text-ink-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span>{label}</span>
      <span className="ml-auto pl-3 font-medium text-ink tabular-nums">{formatCurrency(value)}</span>
    </p>
  );
}
