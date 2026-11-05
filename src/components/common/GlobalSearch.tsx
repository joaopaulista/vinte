import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Search, Tags, User, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchAccounts } from '@/services/accountsService';
import { fetchCategories } from '@/services/categoriesService';
import { fetchOwners } from '@/services/ownersService';
import { searchTransactionsText } from '@/services/transactionsService';
import { formatCurrency, formatDate } from '@/utils/format';
import type { AccountOwner, AccountWithConnection, Category, TransactionWithRelations } from '@/types';

export interface SearchPage {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Palavras extras que também levam à página. */
  keywords?: string;
}

interface Result {
  id: string;
  group: string;
  title: string;
  detail?: string;
  value?: string;
  icon: LucideIcon;
  to: string;
}

/** Minúsculas e sem acento: "transferencia" acha "Transferência". */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function matches(text: string, terms: string[]): boolean {
  const haystack = normalize(text);
  return terms.every((term) => haystack.includes(term));
}

interface Catalog {
  accounts: AccountWithConnection[];
  categories: Category[];
  owners: AccountOwner[];
}

/**
 * Pesquisa em todo o sistema: telas, contas, categorias, responsáveis e
 * transações. Abre pelo botão de lupa, por Ctrl+K (⌘K) ou pela tecla "/".
 */
export function GlobalSearch({ pages, onClose }: { pages: SearchPage[]; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Catalog>({ accounts: [], categories: [], owners: [] });
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
    // Carrega uma vez: são listas curtas e a busca nelas é local.
    // Cada uma falha sozinha (ex.: migration de responsáveis ainda não aplicada).
    void Promise.all([
      fetchAccounts().catch(() => []),
      fetchCategories().catch(() => []),
      fetchOwners().catch(() => []),
    ]).then(([accounts, categories, owners]) => setCatalog({ accounts, categories, owners }));
  }, []);

  const terms = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);

  // Transações: no banco, com uma pausa curta para não buscar a cada tecla.
  useEffect(() => {
    if (query.trim().length < 2) {
      setTransactions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchTransactionsText(query.trim(), 8)
        .then((rows) => !cancelled && setTransactions(rows))
        .catch(() => !cancelled && setTransactions([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const results = useMemo<Result[]>(() => {
    const byId = new Map(catalog.categories.map((category) => [category.id, category]));
    const out: Result[] = [];

    const pageHits = terms.length === 0 ? pages : pages.filter((page) => matches(`${page.label} ${page.keywords ?? ''}`, terms));
    for (const page of pageHits) {
      out.push({ id: `page-${page.to}`, group: 'Telas', title: page.label, icon: page.icon, to: page.to });
    }
    if (terms.length === 0) return out;

    for (const account of catalog.accounts) {
      const institution = account.is_manual ? 'Conta manual' : (account.bank_connection?.institution_name ?? '');
      if (!matches(`${account.name ?? ''} ${institution}`, terms)) continue;
      out.push({
        id: `account-${account.id}`,
        group: 'Contas',
        title: account.name ?? 'Conta',
        detail: institution,
        value: formatCurrency(account.balance),
        icon: Wallet,
        to: '/contas',
      });
    }

    for (const owner of catalog.owners) {
      if (!matches(owner.name, terms)) continue;
      out.push({
        id: `owner-${owner.id}`,
        group: 'Responsáveis',
        title: owner.name,
        detail: 'Ver as contas',
        icon: User,
        to: '/contas',
      });
    }

    for (const category of catalog.categories) {
      const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null;
      const label = parent ? `${parent.name} › ${category.name}` : category.name;
      if (!matches(label, terms)) continue;
      out.push({
        id: `category-${category.id}`,
        group: 'Categorias',
        title: label,
        detail: 'Ver transações da categoria',
        icon: Tags,
        to: `/transacoes?categoria=${parent ? parent.id : category.id}`,
      });
      if (out.filter((result) => result.group === 'Categorias').length >= 6) break;
    }

    for (const transaction of transactions) {
      out.push({
        id: `transaction-${transaction.id}`,
        group: 'Transações',
        title: transaction.description ?? 'Sem descrição',
        detail: [formatDate(transaction.transaction_date), transaction.account?.name, transaction.category?.name]
          .filter(Boolean)
          .join(' · '),
        value: formatCurrency(transaction.amount),
        icon: ArrowRight,
        to: `/transacoes?busca=${encodeURIComponent(transaction.description ?? query.trim())}`,
      });
    }

    out.push({
      id: 'all-transactions',
      group: 'Transações',
      title: `Buscar “${query.trim()}” em todas as transações`,
      icon: Search,
      to: `/transacoes?busca=${encodeURIComponent(query.trim())}`,
    });
    return out;
  }, [catalog, pages, query, terms, transactions]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(result: Result | undefined) {
    if (!result) return;
    onClose();
    navigate(result.to);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === 'Escape') {
      onClose();
    }
  }

  let lastGroup = '';

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center bg-night/50 px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Pesquisar no VINTE" className="card w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          {searching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-3" aria-hidden />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          )}
          <input
            ref={inputRef}
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
            placeholder="Pesquisar transações, contas, categorias, telas…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKey}
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-results"
            aria-activedescendant={results[active] ? `search-${results[active].id}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-3 sm:block">Esc</kbd>
        </div>

        <ul ref={listRef} id="global-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {results.map((result, index) => {
            const header = result.group !== lastGroup ? result.group : null;
            lastGroup = result.group;
            const Icon = result.icon;
            return (
              <li key={result.id} role="presentation">
                {header && <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{header}</p>}
                <div
                  id={`search-${result.id}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(result)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm ${
                    index === active ? 'bg-surface-2' : ''
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink">{result.title}</p>
                    {result.detail && <p className="truncate text-xs text-ink-2">{result.detail}</p>}
                  </div>
                  {result.value && <span className="num shrink-0 text-xs font-medium text-ink-2">{result.value}</span>}
                </div>
              </li>
            );
          })}
          {terms.length > 0 && results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-ink-3">Nada encontrado.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
