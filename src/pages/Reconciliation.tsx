import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCheck, CheckCircle2, Loader2, Search, Sparkles, Undo2, X } from 'lucide-react';
import { ReconciliationCard, initialSelection } from '@/components/reconciliation/ReconciliationCard';
import { QueueRow } from '@/components/reconciliation/QueueRow';
import { ImportStatementCard } from '@/components/reconciliation/ImportStatementCard';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/common/Pagination';
import { PageHeader } from '@/components/common/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { reconcileTransaction, reopenTransaction } from '@/services/transactionsService';
import { applyRulesToPending, learnCategoryRule } from '@/services/categoryRulesService';
import { formatCurrency, formatDate } from '@/utils/format';
import { splitDescription } from '@/utils/merchant';
import { buildSuggester } from '@/utils/categorySuggestion';
import type { CategorySuggestion } from '@/utils/categorySuggestion';
import type { TransactionWithRelations } from '@/types';

/** Minúsculas e sem acento: "transferencia" acha "Transferência". */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Quanto tempo o aviso com "Desfazer" fica na tela. */
const UNDO_MS = 7000;

interface LastAction {
  ids: string[];
  message: string;
}

export default function Reconciliation() {
  const { transactions, loading, error, reload } = useTransactions({ status: 'pending' });
  const { tree, loading: loadingCategories } = useCategories();
  // Histórico do que já foi aprovado: é dele que sai a sugestão de categoria.
  const { transactions: history, loading: loadingHistory } = useTransactions({ status: 'approved' });
  const { refreshPendingCount } = usePendingCount();
  const { user } = useAuth();

  // Some da fila localmente em vez de refazer o fetch a cada conciliação — a
  // lista pode ser longa e recarregá-la faria a próxima transação "pular".
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  // Só leva o foco à transação atual depois de uma ação do usuário; ao abrir
  // a página, o foco fica onde o navegador colocou.
  const [focusActive, setFocusActive] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [bulkStep, setBulkStep] = useState<'idle' | 'confirm' | 'running'>('idle');
  const activeRef = useRef<HTMLDivElement>(null);
  const loadedOnce = useRef(false);

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

  const suggestFor = useMemo(() => {
    const suggest = buildSuggester(history);
    const valid = new Set(tree.flatMap((category) => [category.id, ...category.children.map((child) => child.id)]));
    return (transaction: TransactionWithRelations): CategorySuggestion | null => {
      const suggestion = suggest(transaction);
      // Categoria que foi apagada ou movida desde então não serve de sugestão.
      if (!suggestion || !valid.has(suggestion.categoryId)) return null;
      if (suggestion.subcategoryId && !valid.has(suggestion.subcategoryId)) {
        return { ...suggestion, subcategoryId: null };
      }
      return suggestion;
    };
  }, [history, tree]);

  /** "Moradia › Energia" da categoria que já vem preenchida, se houver. */
  const labelFor = useCallback(
    (transaction: TransactionWithRelations) => {
      const selection = initialSelection(transaction, suggestFor(transaction));
      const category = tree.find((item) => item.id === selection.categoryId);
      if (!category) return null;
      const subcategory = category.children.find((item) => item.id === selection.subcategoryId);
      return [category.name, subcategory?.name].filter(Boolean).join(' › ');
    },
    [suggestFor, tree],
  );

  const active = filtered.find((transaction) => transaction.id === activeId) ?? filtered[0] ?? null;
  const rest = useMemo(
    () => filtered.filter((transaction) => transaction.id !== active?.id),
    [filtered, active?.id],
  );
  const pagination = usePagination(rest);

  // Transações que já vêm com categoria: dá para aprovar todas de uma vez.
  const ready = useMemo(
    () =>
      filtered
        .map((transaction) => ({ transaction, selection: initialSelection(transaction, suggestFor(transaction)) }))
        .filter(({ selection }) => selection.categoryId !== null),
    [filtered, suggestFor],
  );

  const uncategorized = queue.filter((transaction) => !transaction.category_id).length;

  // O aviso com "Desfazer" some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!lastAction) return;
    const timer = window.setTimeout(() => setLastAction(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [lastAction]);

  const moveTo = useCallback((transaction: TransactionWithRelations | undefined) => {
    if (!transaction) return;
    setActiveId(transaction.id);
    setFocusActive(true);
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  /** Próxima da fila depois da atual (ou a anterior, se a atual era a última). */
  function neighbourOf(id: string) {
    const index = filtered.findIndex((transaction) => transaction.id === id);
    return filtered[index + 1] ?? filtered[index - 1];
  }

  async function resolve(
    transaction: TransactionWithRelations,
    status: 'approved' | 'rejected',
    categoryId: string | null,
    subcategoryId: string | null,
    notes: string,
  ) {
    await reconcileTransaction({
      transactionId: transaction.id,
      status,
      categoryId,
      subcategoryId,
      notes: notes.trim() || null,
    });

    const next = neighbourOf(transaction.id);
    setResolvedIds((current) => new Set(current).add(transaction.id));
    if (next) moveTo(next);
    const parent = tree.find((item) => item.id === categoryId);
    const child = parent?.children.find((item) => item.id === subcategoryId);
    const target = [parent?.name, child?.name].filter(Boolean).join(' › ');
    const name = splitDescription(transaction.description).name;
    setLastAction({
      ids: [transaction.id],
      message: status === 'approved' && target ? `Aprovada como ${target}: ${name}` : `Reprovada: ${name}`,
    });
    void refreshPendingCount();

    // Aprender com a escolha: a próxima transação parecida já vem classificada.
    if (status === 'approved' && categoryId && user) {
      void learnCategoryRule({ userId: user.id, description: transaction.description, categoryId, subcategoryId });
    }
  }

  async function approveReady() {
    setBulkStep('running');
    setNotice(null);
    const done: string[] = [];
    try {
      for (const { transaction, selection } of ready) {
        await reconcileTransaction({
          transactionId: transaction.id,
          status: 'approved',
          categoryId: selection.categoryId,
          subcategoryId: selection.subcategoryId,
          notes: transaction.notes,
        });
        done.push(transaction.id);
        if (user && selection.categoryId) {
          void learnCategoryRule({
            userId: user.id,
            description: transaction.description,
            categoryId: selection.categoryId,
            subcategoryId: selection.subcategoryId,
          });
        }
      }
    } catch (cause) {
      setNotice(
        `${done.length} de ${ready.length} aprovadas. As demais não foram salvas: ${
          cause instanceof Error ? cause.message : 'erro desconhecido'
        }`,
      );
    } finally {
      setResolvedIds((current) => new Set([...current, ...done]));
      if (done.length > 0) {
        setLastAction({ ids: done, message: `${done.length} ${done.length === 1 ? 'aprovada' : 'aprovadas'} de uma vez` });
      }
      setBulkStep('idle');
      void refreshPendingCount();
    }
  }

  async function undo() {
    if (!lastAction) return;
    setUndoing(true);
    try {
      await Promise.all(lastAction.ids.map((id) => reopenTransaction(id)));
      setResolvedIds((current) => {
        const next = new Set(current);
        lastAction.ids.forEach((id) => next.delete(id));
        return next;
      });
      setActiveId(lastAction.ids[0]);
      setFocusActive(true);
      setLastAction(null);
      void refreshPendingCount();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível desfazer.');
    } finally {
      setUndoing(false);
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

  // Atalhos: Enter aprova, R reprova, J/K navegam. Desligados enquanto se
  // digita (busca, observação) e dentro das listas de categoria, onde letras
  // escolhem a opção. As setas ficam livres para rolar a página.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !active) return;
      const target = event.target as HTMLElement;
      if (target.closest('[role="dialog"]')) return;

      const key = event.key.toLowerCase();
      const click = (action: 'approve' | 'reject') =>
        document.getElementById(`${active.id}-${action}`)?.click();

      if (key === 'enter') {
        // No campo de categoria o Enter não envia o formulário sozinho.
        const inActiveSelect = target.tagName === 'SELECT' && activeRef.current?.contains(target);
        const onActiveCard = target.hasAttribute('data-active-card');
        if (inActiveSelect || onActiveCard || target === document.body) {
          event.preventDefault();
          click('approve');
        }
        return;
      }

      if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
      const index = filtered.findIndex((transaction) => transaction.id === active.id);

      if (key === 'r') {
        event.preventDefault();
        click('reject');
      } else if (key === 'j') {
        event.preventDefault();
        moveTo(filtered[index + 1]);
      } else if (key === 'k') {
        event.preventDefault();
        moveTo(filtered[index - 1]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Depois da primeira carga, recarregar a fila (após importar um extrato) não
  // troca a página pelo spinner: a lista só se atualiza no lugar.
  if ((loading && !loadedOnce.current) || loadingCategories || loadingHistory) {
    return <Spinner label="Carregando pendências…" />;
  }
  loadedOnce.current = true;

  if (error) {
    return (
      <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
    );
  }

  // Conta pelo que foi resolvido aqui, não pela diferença das listas: depois de
  // importar um extrato a fila é recarregada e as conciliadas somem dela.
  const done = resolvedIds.size;
  const total = queue.length + done;

  async function afterImport(message: string) {
    setNotice(message);
    await reload();
    void refreshPendingCount();
  }

  const progress = (
    <section className="card flex min-w-0 flex-col p-4" aria-label="Andamento da conciliação">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-ink">
          {queue.length} {queue.length === 1 ? 'pendente' : 'pendentes'}
        </span>
        <span className="text-ink-2">
          {done} {done === 1 ? 'conciliada' : 'conciliadas'} desde que você abriu esta página
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div
          className="h-full rounded-full bg-success transition-all"
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </div>

      {(ready.length > 0 || uncategorized > 0) && queue.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {ready.length > 0 &&
            (bulkStep === 'confirm' ? (
              <>
                <span className="text-sm text-ink">
                  Aprovar {ready.length} {ready.length === 1 ? 'transação' : 'transações'} com a
                  categoria já preenchida?
                </span>
                <button type="button" className="btn-primary" onClick={() => void approveReady()}>
                  <CheckCheck className="h-4 w-4" aria-hidden />
                  Sim, aprovar {ready.length}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setBulkStep('idle')}>
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setBulkStep('confirm')}
                disabled={bulkStep === 'running'}
              >
                {bulkStep === 'running' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCheck className="h-4 w-4" aria-hidden />
                )}
                Aprovar sugeridas ({ready.length})
              </button>
            ))}
          {uncategorized > 0 && bulkStep !== 'confirm' && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleSuggest()}
              disabled={suggesting}
              title="Aplica as regras de categorização nas transações ainda sem categoria"
            >
              {suggesting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Sugerir categorias ({uncategorized})
            </button>
          )}
        </div>
      )}

      {notice && (
        <p className="mt-2 text-sm text-info-ink" role="status">
          {notice}
        </p>
      )}
    </section>
  );

  return (
    <div className="page">
      <PageHeader
        title="Conciliação"
        description="Aprovar faz a transação contar nos seus números; reprovar deixa de fora. Dá para desfazer as duas logo depois."
      />

      {/* Duas colunas iguais, nas duas faixas: andamento e importação em cima,
          transação atual e fila embaixo. */}
      <div className="grid shrink-0 gap-4 lg:grid-cols-2">
        {progress}
        <ImportStatementCard onImported={afterImport} />
      </div>

      {queue.length === 0 ? (
        <div className="card page-fill justify-center">
          <EmptyState
            icon={CheckCircle2}
            tone={done > 0 ? 'success' : 'neutral'}
            title={done > 0 ? 'Tudo conciliado!' : 'Nada pendente por aqui'}
            description={
              done > 0
                ? `Você conciliou ${done} ${done === 1 ? 'transação' : 'transações'}. Os números da Home já estão atualizados.`
                : 'Assim que novas transações forem sincronizadas ou um extrato for importado, elas aparecem nesta tela.'
            }
          />
        </div>
      ) : (
        <div className="page-grid lg:grid-cols-2 lg:grid-rows-1">
          <div className="scroll-y -m-1 flex min-w-0 flex-col gap-4 p-1">
            {active ? (
              <div ref={activeRef} className="scroll-mt-1 space-y-2">
                <ReconciliationCard
                  key={active.id}
                  transaction={active}
                  tree={tree}
                  suggestion={suggestFor(active)}
                  focusOnMount={focusActive}
                  onApprove={(categoryId, subcategoryId, notes) =>
                    resolve(active, 'approved', categoryId, subcategoryId, notes)
                  }
                  onReject={(notes) => resolve(active, 'rejected', null, null, notes)}
                />
                <p className="hidden flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 sm:flex">
                  <span>
                    <Kbd>Enter</Kbd> aprova
                  </span>
                  <span>
                    <Kbd>R</Kbd> reprova
                  </span>
                  <span>
                    <Kbd>J</Kbd> <Kbd>K</Kbd> próxima e anterior
                  </span>
                </p>
              </div>
            ) : (
              <div className="card p-6 text-center text-sm text-ink-2">
                Nenhuma transação pendente encontrada para essa pesquisa.
              </div>
            )}
          </div>

          <section className="flex min-w-0 flex-col gap-3 lg:min-h-0" aria-labelledby="queue-title">
            <div className="relative shrink-0">
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
                  className="absolute top-1/2 right-1 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:text-ink"
                  aria-label="Limpar pesquisa"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>

            <h2 id="queue-title" className="shrink-0 text-sm font-semibold text-ink">
              Próximas <span className="font-normal text-ink-2">({rest.length})</span>
              {search && (
                <span className="ml-1 font-normal text-ink-2" role="status">
                  · {filtered.length} de {queue.length} na pesquisa
                </span>
              )}
            </h2>

            {rest.length > 0 ? (
              <>
                <ul className="card scroll-y divide-y divide-line">
                  {pagination.pageItems.map((transaction) => (
                    <QueueRow
                      key={transaction.id}
                      transaction={transaction}
                      suggestedLabel={labelFor(transaction)}
                      onSelect={() => moveTo(transaction)}
                    />
                  ))}
                </ul>
                <Pagination state={pagination} noun="transações" />
              </>
            ) : (
              <div className="card p-6 text-center text-sm text-ink-2">
                {filtered.length === 0 ? 'Nada encontrado.' : 'Esta é a última da fila.'}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Região sempre presente: leitores de tela anunciam o que entra nela. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4 sm:top-auto sm:bottom-4"
      >
        {lastAction && (
          <div
            key={lastAction.ids.join()}
            className="animate-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-ink py-2 pr-2 pl-4 text-sm text-page shadow-lg"
          >
            <span className="min-w-0 truncate">{lastAction.message}</span>
            <button
              type="button"
              onClick={() => void undo()}
              disabled={undoing}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 font-semibold text-page underline underline-offset-4 hover:bg-page/15 disabled:opacity-60"
            >
              {undoing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
              Desfazer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-2">
      {children}
    </kbd>
  );
}
