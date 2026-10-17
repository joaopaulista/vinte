import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

interface FiltersPopoverProps {
  /** Id do painel, para o `aria-controls` do botão. */
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  children: ReactNode;
}

/**
 * Filtros recolhidos num botão no canto superior direito. Abrem num painel
 * suspenso, sem empurrar a página; fecham com Esc ou clicando fora.
 */
export function FiltersPopover({ id, open, onOpenChange, activeCount, children }: FiltersPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative ml-auto">
      <button
        ref={buttonRef}
        type="button"
        className={`btn-secondary ${open ? 'border-accent text-ink' : ''}`}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filtros
        {activeCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink tabular-nums">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div
          id={id}
          role="group"
          aria-label="Filtros"
          className="animate-fade absolute top-full right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-line bg-surface p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Filtros</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="-m-1.5 grid h-7 w-7 place-items-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink"
              aria-label="Recolher filtros"
              title="Recolher filtros"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
