import type { CategoryTree } from '@/types';

interface CategoryPickerProps {
  tree: CategoryTree[];
  categoryId: string | null;
  subcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null) => void;
  disabled?: boolean;
  idPrefix: string;
}

export function CategoryPicker({
  tree,
  categoryId,
  subcategoryId,
  onChange,
  disabled = false,
  idPrefix,
}: CategoryPickerProps) {
  const subcategories = tree.find((category) => category.id === categoryId)?.children ?? [];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={`${idPrefix}-category`}>
          Categoria
        </label>
        <select
          id={`${idPrefix}-category`}
          className="field"
          value={categoryId ?? ''}
          disabled={disabled}
          // Trocar a categoria pai invalida a subcategoria escolhida antes.
          onChange={(event) => onChange(event.target.value || null, null)}
        >
          <option value="">Selecione…</option>
          {tree.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-subcategory`}>
          Subcategoria
        </label>
        <select
          id={`${idPrefix}-subcategory`}
          className="field"
          value={subcategoryId ?? ''}
          disabled={disabled || !categoryId || subcategories.length === 0}
          onChange={(event) => onChange(categoryId, event.target.value || null)}
        >
          <option value="">{categoryId ? 'Opcional…' : 'Escolha a categoria antes'}</option>
          {subcategories.map((subcategory) => (
            <option key={subcategory.id} value={subcategory.id}>
              {subcategory.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
