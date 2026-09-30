import { formatCurrency } from '@/utils/format';

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadEntry[];
}

export function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label !== undefined && (
        <p className="mb-1 font-semibold text-ink capitalize">{label}</p>
      )}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-ink-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          <span>{entry.name}</span>
          <span className="ml-auto pl-3 font-medium text-ink tabular-nums">
            {formatCurrency(Number(entry.value))}
          </span>
        </p>
      ))}
    </div>
  );
}
