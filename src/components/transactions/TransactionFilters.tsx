import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { FiltersPopover } from '@/components/common/FiltersPopover';
import type { CategoryTree, TransactionFilters as Filters } from '@/types';

interface TransactionFiltersProps {
  filters: Filters;
  tree: CategoryTree[];
  onChange: (filters: Filters) => void;
  onReset: () => void;
}

/**
 * Busca sempre à vista; status, categoria e período ficam recolhidos no botão
 * Filtros, que mostra quantos estão ativos.
 */
export function TransactionFilters({ filters, tree, onChange, onReset }: TransactionFiltersProps) {
  const [open, setOpen] = useState(false);

  function patch(partial: Partial<Filters>) {
    onChange({ ...filters, ...partial });
  }

  const activeCount =
    Number(filters.status !== 'all') +
    Number(filters.categoryId !== 'all') +
    Number(Boolean(filters.from || filters.to));

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3"
          aria-hidden
        />
        <label className="sr-only" htmlFor="filter-search">
          Buscar transações
        </label>
        <input
          id="filter-search"
          type="search"
          className="field pr-9 pl-9"
          placeholder="Buscar por descrição, valor, data, conta, categoria, status ou observação…"
          value={filters.search}
          onChange={(event) => patch({ search: event.target.value })}
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => patch({ search: '' })}
            className="absolute top-1/2 right-1 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:text-ink"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <FiltersPopover id="filtros-transacoes" open={open} onOpenChange={setOpen} activeCount={activeCount}>
        <label className="block">
          <span className="label">Status</span>
          <select
            className="field py-1.5"
            value={filters.status}
            onChange={(event) => patch({ status: event.target.value as Filters['status'] })}
          >
            <option value="all">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Reprovadas</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Categoria</span>
          <select
            className="field py-1.5"
            value={filters.categoryId}
            onChange={(event) => patch({ categoryId: event.target.value })}
          >
            <option value="all">Todas</option>
            {tree.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="label">Período</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="mb-0.5 block text-xs text-ink-2">De</span>
              <input
                type="date"
                className="field py-1.5"
                value={filters.from ?? ''}
                onChange={(event) => patch({ from: event.target.value || null })}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-0.5 block text-xs text-ink-2">Até</span>
              <input
                type="date"
                className="field py-1.5"
                value={filters.to ?? ''}
                onChange={(event) => patch({ to: event.target.value || null })}
              />
            </label>
          </div>
        </fieldset>

        {(activeCount > 0 || filters.search) && (
          <button type="button" className="btn-secondary min-h-8 w-full py-1 text-xs" onClick={onReset}>
            Limpar filtros
          </button>
        )}
      </FiltersPopover>
    </div>
  );
}
