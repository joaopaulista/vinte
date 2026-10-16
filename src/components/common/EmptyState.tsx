import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** 'success' para estados de conquista ("Tudo conciliado!"). */
  tone?: 'neutral' | 'success';
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center lg:h-full">
      <span
        className={`rounded-full p-3 ${
          tone === 'success' ? 'bg-success-surface text-success-ink' : 'bg-surface-2 text-ink-3'
        }`}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-2">{description}</p>}
      {action}
    </div>
  );
}
