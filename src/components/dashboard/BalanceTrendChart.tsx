import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { AXIS_TICK, CHART_COLORS } from './chartTheme';
import { formatCurrencyCompact } from '@/utils/format';

export interface BalanceTrendPoint {
  label: string;
  balance: number;
}

/**
 * Saldo mensal (receitas menos despesas) ao longo do tempo.
 *
 * Série única, então dispensa legenda — o título já diz o que a linha é. A
 * linha de referência no zero é o que dá sentido ao gráfico: o que importa não
 * é a altura, é estar acima ou abaixo dela.
 */
export function BalanceTrendChart({ data }: { data: BalanceTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.axis }}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => formatCurrencyCompact(value)}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLORS.axis }} />
        <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="balance"
          name="Saldo"
          stroke={CHART_COLORS.single}
          strokeWidth={2}
          dot={{ r: 4, fill: CHART_COLORS.single, strokeWidth: 0 }}
          activeDot={{ r: 6, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
