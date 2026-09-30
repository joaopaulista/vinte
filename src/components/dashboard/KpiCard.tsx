import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatCurrency } from '@/utils/format';

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Valor do mês anterior, para calcular a variação. */
  previousValue?: number;
  /** Em despesas, cair é bom — inverte a leitura da seta. */
  lowerIsBetter?: boolean;
  hint?: string;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  previousValue,
  lowerIsBetter = false,
  hint,
}: KpiCardProps) {
  const delta = computeDelta(value, previousValue);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        <Icon className="h-4 w-4 text-ink-3" aria-hidden />
      </div>

      <p className="mt-2 text-2xl font-semibold text-ink">{formatCurrency(value)}</p>

      {delta === null ? (
        hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>
      ) : (
        <DeltaLabel percentage={delta} lowerIsBetter={lowerIsBetter} />
      )}
    </div>
  );
}

function DeltaLabel({
  percentage,
  lowerIsBetter,
}: {
  percentage: number;
  lowerIsBetter: boolean;
}) {
  const isFlat = Math.abs(percentage) < 0.5;
  const isUp = percentage > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;

  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const tone = isFlat ? 'text-ink-3' : isGood ? 'text-success-ink' : 'text-danger-ink';

  return (
    <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {isFlat ? 'estável' : `${Math.abs(percentage).toFixed(0)}%`}
      <span className="font-normal text-ink-3">vs. mês anterior</span>
    </p>
  );
}

/** Sem base de comparação (ou base zero) não existe variação percentual honesta. */
function computeDelta(value: number, previousValue?: number): number | null {
  if (previousValue === undefined || previousValue === 0) return null;
  return ((value - previousValue) / Math.abs(previousValue)) * 100;
}
