import { CategoryManager } from '@/components/categories/CategoryManager';

export default function Categories() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Categorias</h1>
        <p className="mt-1 text-sm text-ink-2">
          Cadastre, renomeie e apague categorias e subcategorias.
        </p>
      </header>

      <CategoryManager />
    </div>
  );
}
