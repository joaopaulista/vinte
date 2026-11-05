import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  /** Enquanto salva, Esc e o clique fora não fecham. */
  busy?: boolean;
  children: ReactNode;
  /** Largura máxima do card (classe do Tailwind). */
  size?: string;
}

/**
 * Janela modal simples: fundo escurecido, card centralizado, fecha com Esc,
 * com o X ou clicando fora. O foco vai para o primeiro campo ao abrir e volta
 * para quem abriu ao fechar.
 */
export function Dialog({ title, onClose, busy = false, children, size = 'max-w-lg' }: DialogProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = cardRef.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    first?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/50 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`card w-full p-5 ${size}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
