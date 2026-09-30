import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import type { CategoryAnomaly } from '@/utils/analytics';

/**
 * O elemento de "olhe para cá" do dashboard. Cada linha responde direto à
 * pergunta que o painel existe para responder: isso está normal?
 */
export function AnomalyCard({ anomalies }: { anomalies: CategoryAnomaly[] }) {
  if (anomalies.length === 0) return null;

  return (
    <section className="card border-warn-ink/30 bg-warn-surface p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-warn-ink" aria-hidden />
        <h2 className="text-base font-semibold text-warn-ink">Fora do padrão neste mês</h2>
      </div>
      <p className="mt-1 text-sm text-warn-ink/80">
        Comparado ao mesmo intervalo de dias dos meses anteriores.
      </p>

      <ul className="mt-4 space-y-3">
        {anomalies.map((anomaly) => (
          <li key={anomaly.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-warn-ink">{anomaly.name}</span>
            <span className="text-sm text-warn-ink/90">
              {formatCurrency(anomaly.current)}
            </span>
            <span className="text-sm text-warn-ink/70">
              — {Math.round((anomaly.ratio - 1) * 100)}% acima da média de{' '}
              {formatCurrency(anomaly.baseline)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
