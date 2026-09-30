import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, Sparkles, X } from 'lucide-react';
import { ReconciliationCard } from '@/components/reconciliation/ReconciliationCard';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/common/Pagination';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { reconcileTransaction } from '@/services/transactionsService';
import { applyRulesToPending, learnCategoryRule } from '@/services/categoryRulesService';
import { formatCurrency, formatDate } from '@/utils/format';

/** Minúsculas e sem acento: "transferencia" acha "Transferência". */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export default function Reconciliation() {
  const { transactions, loading, error, reload } = useTransactions({ status: 'pending' });
  const { tree, loading: loadingCategories } = useCategories();
  const { refreshPendingCount } = usePendingCount();
  const { user } = useAuth();

  // Some da fila localmente em vez de refazer o fetch a cada conciliação — a
  // lista pode ser longa e recarregá-la faria o card seguinte "pular".
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const queue = useMemo(
    () => transactions.filter((transaction) => !resolvedIds.has(transaction.id)),
    [transactions, resolvedIds],
  );

  // Busca por descrição, observação, valor ou data. Cada palavra precisa
  // aparecer em algum lugar: "edp 231" acha a conta de luz de R$ 231,45.
  const filtered = useMemo(() => {
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return queue;
    return queue.filter((transaction) => {
      const haystack = normalize(
        [
          transaction.description ?? '',
          transaction.notes ?? '',
          transaction.account?.name ?? '',
          formatCurrency(transaction.amount),
          String(Math.abs(transaction.amount)).replace('.', ','),
          formatDate(transaction.transaction_date),
        ].join(' '),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [queue, search]);

  const pagination = usePagination(filtered, 10);

  const uncategorized = queue.filter((transaction) => !transaction.category_id).length;

  async function resolve(
    transactionId: string,
    status: 'approved' | 'rejected',
    categoryId: string | null,
    subcategoryId: string | null,
    notes: string,
    description: string | null,
  ) {
    await reconcileTransaction({
      transactionId,
      status,
      categoryId,
      subcategoryId,
      notes: notes.trim() || null,
    });

    setResolvedIds((current) => new Set(current).add(transactionId));
    void refreshPendingCount();

    // Aprender com a escolha: a próxima transação parecida já vem classificada.
    if (status === 'approved' && categoryId && user) {
      void learnCategoryRule({
        userId: user.id,
        description,
        categoryId,
        subcategoryId,
      });
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setNotice(null);
    try {
      const count = await applyRulesToPending();
      setNotice(
        count === 0
          ? 'Nenhuma regra bateu com as transações que faltam classificar.'
          : `${count} ${count === 1 ? 'transação recebeu' : 'transações receberam'} uma sugestão de categoria.`,
      );
      if (count > 0) await reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Falha ao sugerir categorias.');
    } finally {
      setSuggesting(false);
    }
  }

  if (loading || loadingCategories) return <Spinner label="Carregando pendências…" />;

  if (error) {
    return (
      <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">
        {error}
      </div>
    );
  }

  const done = transactions.length - queue.length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Conciliação</h1>
        <p className="mt-1 text-sm text-ink-2">
          Classifique cada transação e decida se ela entra nos seus números.
        </p>
      </header>

      {transactions.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink-2">
              {queue.length} {queue.length === 1 ? 'pendente' : 'pendentes'}
            </span>
            <span className="text-ink-2">
              {done} de {transactions.length} conciliadas agora
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${(done / transactions.length) * 100}%` }}
            />
          </div>

          {uncategorized > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p className="text-sm text-ink-2">
                {uncategorized} sem categoria. As regras podem preencher boa parte.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleSuggest()}
                disabled={suggesting}
              >
                {suggesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                Sugerir categorias
              </button>
            </div>
          )}

          {notice && <p className="mt-2 text-sm text-info-ink">{notice}</p>}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CheckCircle2}
            title={done > 0 ? 'Tudo conciliado!' : 'Nada pendente por aqui'}
            description={
              done > 0
                ? 'Você zerou a fila. Os valores aprovados já estão refletidos no dashboard.'
                : 'Assim que novas transações forem sincronizadas, elas aparecem nesta tela.'
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <label className="sr-only" htmlFor="reconciliation-search">
              Pesquisar transações pendentes
            </label>
            <input
              id="reconciliation-search"
              type="search"
              className="field pr-9 pl-9"
              placeholder="Pesquisar por descrição, valor, data ou observação…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink"
                aria-label="Limpar pesquisa"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          {search && (
            <p className="text-sm text-ink-2">
              {filtered.length === 0
                ? 'Nenhuma transação pendente encontrada para essa pesquisa.'
                : `${filtered.length} de ${queue.length} ${queue.length === 1 ? 'pendente' : 'pendentes'}`}
            </p>
          )}

          {pagination.pageItems.map((transaction) => (
            <ReconciliationCard
              key={transaction.id}
              transaction={transaction}
              tree={tree}
              onApprove={(categoryId, subcategoryId, notes) =>
                resolve(
                  transaction.id,
                  'approved',
                  categoryId,
                  subcategoryId,
                  notes,
                  transaction.description,
                )
              }
              onReject={(notes) =>
                resolve(transaction.id, 'rejected', null, null, notes, transaction.description)
              }
            />
          ))}
          <Pagination state={pagination} noun="pendentes" hideSizeSelector />
        </div>
      )}
    </div>
  );
}
