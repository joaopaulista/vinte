import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationState } from '@/hooks/usePagination';

const PAGE_SIZES = [10, 20, 50, 100];

interface PaginationProps {
  state: PaginationState<unknown>;
  /** Rótulo do item no plural, para o "1–20 de 228 transações". */
  noun?: string;
  /** Esconde o seletor de itens por página (listas curtas, cards). */
  hideSizeSelector?: boolean;
}

/** Números de página com reticências: 1 … 4 5 6 … 12. */
function pageNumbers(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const result: (number | '…')[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push('…');
    result.push(value);
  });
  return result;
}

export function Pagination({ state, noun = 'itens', hideSizeSelector = false }: PaginationProps) {
  const { page, pageCount, pageSize, total, setPage, setPageSize } = state;
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2"
      aria-label="Paginação"
    >
      <p className="tabular-nums">
        {first}–{last} de {total} {noun}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {!hideSizeSelector && (
          <label className="flex items-center gap-2">
            <span className="text-ink-3">Por página</span>
            <select
              className="field w-auto py-1"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <PageButton label="Página anterior" disabled={page === 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </PageButton>
            {pageNumbers(page, pageCount).map((value, index) =>
              value === '…' ? (
                <span key={`gap-${index}`} className="px-1 text-ink-3">
                  …
                </span>
              ) : (
                <PageButton
                  key={value}
                  label={`Página ${value}`}
                  current={value === page}
                  onClick={() => setPage(value)}
                >
                  {value}
                </PageButton>
              ),
            )}
            <PageButton label="Próxima página" disabled={page === pageCount} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </PageButton>
          </div>
        )}
      </div>
    </nav>
  );
}

function PageButton({
  label,
  children,
  onClick,
  disabled,
  current = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 min-w-8 place-items-center rounded-md px-2 tabular-nums transition disabled:opacity-40 ${
        current ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
