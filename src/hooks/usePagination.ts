import { useEffect, useMemo, useState } from 'react';

/** Teto de registros por página em todas as listas do app. */
export const MAX_PAGE_SIZE = 10;

export interface PaginationState<T> {
  pageItems: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
}

/**
 * Paginação no cliente. Quando a lista encolhe (filtro novo, item conciliado)
 * e a página atual deixa de existir, cai para a última página válida em vez
 * de mostrar uma página vazia.
 */
export function usePagination<T>(
  items: T[],
  requestedPageSize = MAX_PAGE_SIZE,
  /** Listas curtas de cadastro (categorias) podem passar do teto de 10. */
  { allowAboveMax = false }: { allowAboveMax?: boolean } = {},
): PaginationState<T> {
  const pageSize = allowAboveMax ? requestedPageSize : Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return {
    pageItems,
    page: safePage,
    pageCount,
    pageSize,
    total: items.length,
    setPage: (next) => setPage(Math.min(Math.max(1, next), pageCount)),
  };
}
