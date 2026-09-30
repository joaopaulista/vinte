import { Search } from 'lucide-react';
import type { CategoryTree, TransactionFilters as Filters } from '@/types';

interface TransactionFiltersProps {
  filters: Filters;
  tree: CategoryTree[];
  onChange: (filters: Filters) => void;
  onReset: () => void;
}

export function TransactionFilters({
  filters,
  tree,
  onChange,
  onReset,
}: TransactionFiltersProps) {
  function patch(partial: Partial<Filters>) {
    onChange({ ...filters, ...partial });
  }

  return (
    <div className="card p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <label className="label" htmlFor="filter-search">
            Buscar
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <input
              id="filter-search"
              className="field pl-9"
              placeholder="Descrição da transação"
              value={filters.search}
              onChange={(event) => patch({ search: event.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="filter-status">
            Status
          </label>
          <select
            id="filter-status"
            className="field"
            value={filters.status}
            onChange={(event) => patch({ status: event.target.value as Filters['status'] })}
          >
            <option value="all">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Reprovadas</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="filter-category">
            Categoria
          </label>
          <select
            id="filter-category"
            className="field"
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
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="filter-from">
              De
            </label>
            <input
              id="filter-from"
              type="date"
              className="field"
              value={filters.from ?? ''}
              onChange={(event) => patch({ from: event.target.value || null })}
            />
          </div>
          <div>
            <label className="label" htmlFor="filter-to">
              Até
            </label>
            <input
              id="filter-to"
              type="date"
              className="field"
              value={filters.to ?? ''}
              onChange={(event) => patch({ to: event.target.value || null })}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button type="button" className="btn-secondary" onClick={onReset}>
          Limpar filtros
        </button>
      </div>
    </div>
  );
}
