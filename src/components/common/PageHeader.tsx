import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Botões ou avisos alinhados à direita do título. */
  actions?: ReactNode;
}

/** Cabeçalho comum das páginas: título, uma linha de contexto e ações. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.025em] text-ink">{title}</h1>
        {description && <div className="mt-1 text-sm text-ink-2">{description}</div>}
      </div>
      {actions}
    </header>
  );
}
