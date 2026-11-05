import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import { readGoals } from '@/services/goalsService';
import { GoalRow, goalLabel, progressFor } from '@/components/goals/goalParts';
import type { TransactionWithRelations } from '@/types';

/** Quanto tempo cada meta fica na tela antes de a próxima entrar. */
const ROTATE_MS = 7000;

interface GoalCardProps {
  /** Transações aprovadas do mês. */
  monthTransactions: TransactionWithRelations[];
}

/**
 * Metas e limites do mês: quanto de cada meta já foi alcançado e quanto de
 * cada limite já foi usado. Mostra um por vez (metas primeiro); a cada 7 s o
 * próximo entra pela direita. Só acompanha; criar e editar fica em Categorias.
 */
export function GoalCard({ monthTransactions }: GoalCardProps) {
  const { user } = useAuth();
  const { byId } = useCategories();
  // Metas (o que atingir) antes dos limites (o que não passar).
  const goals = readGoals(user).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'target' ? -1 : 1));
  const [index, setIndex] = useState(0);
  // A meta que está saindo pela esquerda enquanto a nova entra.
  const [leaving, setLeaving] = useState<number | null>(null);
  // Parado enquanto o mouse ou o foco do teclado estão no card.
  const [paused, setPaused] = useState(false);

  const count = goals.length;
  const current = count > 0 ? index % count : 0;

  function goTo(next: number) {
    if (next === current) return;
    setLeaving(current);
    setIndex(next);
  }

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setTimeout(() => {
      setLeaving(current);
      setIndex((current + 1) % count);
    }, ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [count, current, paused]);

  const renderGoal = (position: number) => {
    const goal = goals[position];
    return (
      <GoalRow
        label={`${goal.kind === 'target' ? 'Meta' : 'Limite'} · ${goalLabel(goal, byId)}`}
        kind={goal.kind}
        value={progressFor(goal, monthTransactions)}
        amount={goal.limit}
      />
    );
  };

  return (
    <div
      className="card flex h-full flex-col p-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-2">
          Metas e limites
          {count > 1 && (
            <span className="ml-1 font-normal text-ink-3 num">
              {current + 1}/{count}
            </span>
          )}
        </p>
        <Target className="h-4 w-4 text-ink-3" aria-hidden />
      </div>

      {count === 0 ? (
        <p className="mt-1.5 text-sm text-ink-2">
          Nenhuma meta ou limite definido. Cadastre em{' '}
          <Link to="/categorias" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
            Categorias
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="relative mt-1 flex-1 overflow-hidden pt-1" aria-live={paused ? 'polite' : 'off'}>
            <div key={`in-${current}`} className={leaving !== null ? 'animate-slide-in' : undefined}>
              {renderGoal(current)}
            </div>
            {leaving !== null && leaving < count && (
              <div
                key={`out-${leaving}`}
                className="animate-slide-out absolute inset-x-0 top-1"
                aria-hidden
                onAnimationEnd={() => setLeaving(null)}
              >
                {renderGoal(leaving)}
              </div>
            )}
          </div>

          {count > 1 && (
            <div className="mt-2 flex justify-center gap-1.5">
              {goals.map((goal, position) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => goTo(position)}
                  className="grid h-4 w-4 place-items-center"
                  aria-label={`Ver meta ${position + 1}: ${goalLabel(goal, byId)}`}
                  aria-current={position === current ? 'true' : undefined}
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all ${
                      position === current ? 'w-4 bg-ink' : 'w-1.5 bg-line hover:bg-ink-3'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
