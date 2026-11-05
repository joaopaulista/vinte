import { CategoryManager } from '@/components/categories/CategoryManager';
import { GoalsManager } from '@/components/goals/GoalsManager';
import { PageHeader } from '@/components/common/PageHeader';
import { useTransactions } from '@/hooks/useTransactions';
import { currentMonthKey } from '@/utils/analytics';

export default function Categories() {
  // Uma busca só para os dois painéis: o andamento usa as aprovadas do mês.
  const { transactions } = useTransactions({ status: 'approved', from: `${currentMonthKey(new Date())}-01` });

  return (
    <div className="page">
      <PageHeader
        title="Categorias"
        description="Cadastre categorias e subcategorias, as metas que o mês precisa atingir e os limites que não pode passar."
      />

      {/* Desktop: categorias à esquerda; metas e limites empilhados à direita. */}
      <div className="page-grid lg:grid-cols-2 lg:grid-rows-1">
        <CategoryManager />
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          <GoalsManager kind="target" monthTransactions={transactions} />
          <GoalsManager kind="limit" monthTransactions={transactions} />
        </div>
      </div>
    </div>
  );
}
