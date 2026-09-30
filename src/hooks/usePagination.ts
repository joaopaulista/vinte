import { useEffect, useMemo, useState } from 'react';

export interface PaginationState<T> {
  pageItems: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * Paginação no cliente. Quando a lista encolhe (filtro novo, item conciliado)
 * e a página atual deixa de existir, cai para a última página válida em vez
 * de mostrar uma página vazia.
 */
export function usePagination<T>(items: T[], initialPageSize = 20): PaginationState<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

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
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
  };
}
