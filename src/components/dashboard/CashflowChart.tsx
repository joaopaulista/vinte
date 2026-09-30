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
import { ChartTooltip } from './ChartTooltip';
import { AXIS_TICK, CHART_COLORS } from './chartTheme';
import { formatCurrencyCompact } from '@/utils/format';

export interface CashflowPoint {
  label: string;
  income: number;
  expense: number;
}

export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
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
        <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_COLORS.cursor }} />
        <Legend
          verticalAlign="top"
          align="right"
          height={32}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: CHART_COLORS.muted }}
        />
        <Bar
          dataKey="income"
          name="Entradas"
          fill={CHART_COLORS.income}
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
          isAnimationActive={false}
        />
        <Bar
          dataKey="expense"
          name="Saídas"
          fill={CHART_COLORS.expense}
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
