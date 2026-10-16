import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { AXIS_TICK, CHART_COLORS } from './chartTheme';
import { formatCurrency, formatCurrencyCompact } from '@/utils/format';

export interface CategorySpendingPoint {
  name: string;
  total: number;
}

/** Altura mínima para as barras não ficarem espremidas; acima disso, o gráfico ocupa o espaço que tiver. */
export function categoryChartMinHeight(count: number): number {
  return Math.max(160, count * 30 + 40);
}

/**
 * Barras horizontais ordenadas: a comparação é de magnitude entre categorias,
 * e o nome de cada uma fica legível sem rotacionar rótulo (o que uma pizza ou
 * um gráfico de colunas não dariam com 8 categorias).
 *
 * Preenche a altura do contêiner. Com `onSelect`, clicar numa barra (ou na
 * linha dela) escolhe a categoria.
 */
export function CategorySpendingChart({
  data,
  onSelect,
}: {
  data: CategorySpendingPoint[];
  onSelect?: (name: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        className={onSelect ? 'cursor-pointer' : undefined}
        onClick={(state: { activeLabel?: string } | null) => {
          if (onSelect && state?.activeLabel) onSelect(state.activeLabel);
        }}
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 72, bottom: 4, left: 8 }}
        barCategoryGap={6}
      >
        <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCurrencyCompact(value)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.axis }}
          width={116}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_COLORS.cursor }} />
        <Bar
          dataKey="total"
          name="Gasto"
          fill={CHART_COLORS.single}
          radius={[0, 4, 4, 0]}
          maxBarSize={28}
          isAnimationActive={false}
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
