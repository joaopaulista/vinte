import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import { readGoals } from '@/services/goalsService';
import { GoalRow, goalLabel, spentFor } from '@/components/goals/goalParts';
import type { TransactionWithRelations } from '@/types';

interface GoalCardProps {
  /** Despesas aprovadas do mês. */
  expenses: TransactionWithRelations[];
}

/**
 * Metas de gastos do mês: quanto de cada teto já foi usado e quanto ainda
 * resta. Só acompanha; criar e editar metas fica em Categorias.
 */
export function GoalCard({ expenses }: GoalCardProps) {
  const { user } = useAuth();
  const { byId } = useCategories();
  const goals = readGoals(user);

  return (
    <div className="card flex h-full flex-col p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-2">Metas do mês</p>
        <Target className="h-4 w-4 text-ink-3" aria-hidden />
      </div>

      {goals.length === 0 ? (
        <p className="mt-1.5 text-sm text-ink-2">
          Nenhuma meta definida. Cadastre em{' '}
          <Link to="/categorias" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
            Categorias
          </Link>
          .
        </p>
      ) : (
        <ul className="-mx-1 mt-1 max-h-44 space-y-2.5 overflow-y-auto px-1 pt-1">
          {goals.map((goal) => (
            <li key={goal.id}>
              <GoalRow label={goalLabel(goal, byId)} spent={spentFor(goal, expenses)} limit={goal.limit} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
