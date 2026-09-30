import type { ReconciliationStatus } from '@/types';

/**
 * O status nunca depende só da cor: cada badge carrega o rótulo escrito. Isso
 * importa porque "aprovada" e "reprovada" caem no eixo verde/vermelho, o par
 * que protanopes e deuteranopes não separam.
 */
const STATUS_STYLES: Record<ReconciliationStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pendente',
    className: 'bg-warn-surface text-warn-ink ring-warn-ink/25',
  },
  approved: {
    label: 'Aprovada',
    className: 'bg-success-surface text-success-ink ring-success/30',
  },
  rejected: {
    label: 'Reprovada',
    className: 'bg-danger-surface text-danger-ink ring-danger/30',
  },
};

export function StatusBadge({ status }: { status: ReconciliationStatus }) {
  const { label, className } = STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}
