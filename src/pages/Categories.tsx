import { CategoryManager } from '@/components/categories/CategoryManager';
import { GoalsManager } from '@/components/goals/GoalsManager';
import { PageHeader } from '@/components/common/PageHeader';

export default function Categories() {
  return (
    <div className="page">
      <PageHeader
        title="Categorias"
        description="Cadastre categorias e subcategorias e defina metas de gastos para elas."
      />

      {/* Desktop: categorias e metas lado a lado; celular: uma embaixo da outra. */}
      <div className="page-grid lg:grid-cols-2 lg:grid-rows-1">
        <CategoryManager />
        <GoalsManager />
      </div>
    </div>
  );
}
