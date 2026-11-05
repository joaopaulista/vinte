import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CalendarDays, CreditCard, Landmark, Pencil, Plus, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConnectBankButton } from '@/components/accounts/ConnectBankButton';
import { ManualAccountDialog } from '@/components/accounts/ManualAccountDialog';
import { CardDaysDialog } from '@/components/accounts/CardDaysDialog';
import { nextCardCycle } from '@/utils/cardCycle';
import { EmptyState } from '@/components/common/EmptyState';
import { OwnerDot } from '@/components/owners/OwnerDot';
import { OwnersDialog } from '@/components/owners/OwnersDialog';
import { Spinner } from '@/components/common/Spinner';
import { PageHeader } from '@/components/common/PageHeader';
import { fetchAccounts, fetchBankConnections } from '@/services/accountsService';
import { setAccountOwner } from '@/services/ownersService';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { useOwners } from '@/hooks/useOwners';
import { formatCurrency, formatDate } from '@/utils/format';
import type { AccountOwner, AccountWithConnection, BankConnection, SyncResult } from '@/types';

export default function Accounts() {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [accounts, setAccounts] = useState<AccountWithConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { refreshPendingCount } = usePendingCount();
  // Conta manual aberta no diálogo: `null` cria uma nova; `undefined` = fechado.
  const [editingManual, setEditingManual] = useState<AccountWithConnection | null | undefined>(undefined);
  const { owners, reload: reloadOwners } = useOwners();
  const [ownersOpen, setOwnersOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<AccountWithConnection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConnections, nextAccounts] = await Promise.all([
        fetchBankConnections(),
        fetchAccounts(),
      ]);
      setConnections(nextConnections);
      setAccounts(nextAccounts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar contas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const afterSync = useCallback(
    async (result: SyncResult) => {
      setNotice(describeSync(result));
      await Promise.all([load(), refreshPendingCount()]);
    },
    [load, refreshPendingCount],
  );

  const debitAccounts = accounts.filter((account) => !isCreditAccount(account));
  const creditAccounts = accounts.filter(isCreditAccount);
  // No cartão, o saldo do Pluggy é o que está em aberto: a soma das faturas.
  const totalToPay = creditAccounts.reduce((sum, account) => sum + Math.abs(account.balance ?? 0), 0);
  // Todo banco conectado precisa de um responsável (quando há responsáveis cadastrados).
  const connectedWithoutOwner = accounts.filter((account) => !account.is_manual && !account.owner_id).length;

  async function changeOwner(accountId: string, ownerId: string | null) {
    const previous = accounts;
    setAccounts((current) => current.map((account) => (account.id === accountId ? { ...account, owner_id: ownerId } : account)));
    try {
      await setAccountOwner(accountId, ownerId);
    } catch (cause) {
      setAccounts(previous);
      setError(cause instanceof Error ? cause.message : 'Não foi possível trocar o responsável.');
    }
  }

  const ownerProps = { owners, onChangeOwner: (id: string, ownerId: string | null) => void changeOwner(id, ownerId) };

  return (
    <div className="page">
      <PageHeader
        title="Contas"
        description={
          <>
            Bancos conectados via Open Finance e contas manuais, separados entre débito e crédito.
            {lastSyncLabel(connections)} Para atualizar, clique no logo do VINTE no menu.
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOwnersOpen(true)}>
              <Users className="h-4 w-4" aria-hidden />
              Responsáveis
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditingManual(null)}>
              <Plus className="h-4 w-4" aria-hidden />
              Conta manual
            </button>
            <ConnectBankButton onConnected={afterSync} />
          </div>
        }
      />

      {notice && (
        <div className="card shrink-0 border-success/30 bg-success-surface p-3 text-sm text-success-ink">
          {notice}
        </div>
      )}

      {!loading && connectedWithoutOwner > 0 && (
        <div className="card flex shrink-0 items-start gap-3 border-warn-ink/30 bg-warn-surface p-3 text-sm text-warn-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {connectedWithoutOwner === 1
              ? '1 conta conectada está sem responsável.'
              : `${connectedWithoutOwner} contas conectadas estão sem responsável.`}{' '}
            {owners.length === 0
              ? 'Cadastre os responsáveis e escolha quem cuida de cada banco.'
              : 'Escolha quem cuida de cada banco no campo "Responsável" do card.'}
          </p>
          {owners.length === 0 && (
            <button type="button" className="btn-secondary min-h-8 shrink-0 px-3 py-1 text-xs" onClick={() => setOwnersOpen(true)}>
              Cadastrar
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="card shrink-0 border-danger/30 bg-danger-surface p-3 text-sm text-danger-ink">{error}</div>
      )}

      {loading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <div className="card page-fill justify-center">
          <EmptyState
            icon={Wallet}
            title="Nenhuma conta cadastrada"
            description="Use 'Conectar banco' para abrir o Pluggy Connect, ou 'Conta manual' para registrar dinheiro em espécie e contas sem Open Finance."
          />
        </div>
      ) : (
        // Débito e crédito lado a lado: saldo de conta e fatura de cartão não se somam.
        <div className="page-grid lg:grid-cols-2 lg:grid-rows-1">
          <AccountSection
            icon={Landmark}
            title="Débito"
            hint="Contas corrente e poupança: o saldo é o que você tem."
            accounts={debitAccounts}
            empty="Nenhuma conta de débito conectada."
            onEditManual={setEditingManual}
            {...ownerProps}
          />
          <AccountSection
            icon={CreditCard}
            title="Crédito"
            hint="Cartões: o valor é o que você tem a pagar."
            accounts={creditAccounts}
            empty="Nenhum cartão de crédito conectado."
            summary={
              creditAccounts.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-ink-2">Total a pagar</p>
                  <p className="num text-lg font-semibold text-danger-ink">{formatCurrency(totalToPay)}</p>
                </div>
              )
            }
            credit
            onEditCard={setEditingCard}
            {...ownerProps}
          />
        </div>
      )}

      {ownersOpen && (
        <OwnersDialog
          owners={owners}
          accountCount={(ownerId) => accounts.filter((account) => account.owner_id === ownerId).length}
          onClose={() => setOwnersOpen(false)}
          onChanged={async () => {
            await Promise.all([reloadOwners(), load()]);
          }}
        />
      )}

      {editingCard && (
        <CardDaysDialog
          account={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={() => {
            setEditingCard(null);
            void load();
          }}
        />
      )}

      {editingManual !== undefined && (
        <ManualAccountDialog
          account={editingManual}
          onClose={() => setEditingManual(undefined)}
          onSaved={() => {
            setEditingManual(undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  CHECKING_ACCOUNT: 'Conta corrente',
  SAVINGS_ACCOUNT: 'Poupança',
  CREDIT_CARD: 'Cartão de crédito',
  BANK: 'Conta bancária',
  CREDIT: 'Crédito',
  CASH: 'Dinheiro',
  INVESTMENT: 'Investimento',
  OTHER: 'Outra',
};

function isCreditAccount(account: AccountWithConnection): boolean {
  const type = (account.type ?? '').toUpperCase();
  return type === 'CREDIT_CARD' || type === 'CREDIT';
}

function AccountSection({
  icon: Icon,
  title,
  hint,
  accounts,
  empty,
  summary,
  credit = false,
  onEditManual,
  onEditCard,
  owners,
  onChangeOwner,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  accounts: AccountWithConnection[];
  empty: string;
  summary?: ReactNode;
  credit?: boolean;
  onEditManual?: (account: AccountWithConnection) => void;
  onEditCard?: (account: AccountWithConnection) => void;
  owners: AccountOwner[];
  onChangeOwner: (accountId: string, ownerId: string | null) => void;
}) {
  return (
    <section className="panel gap-3" aria-labelledby={`accounts-${title}`}>
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={`accounts-${title}`} className="text-sm font-semibold text-ink">
              {title} <span className="font-normal text-ink-3">({accounts.length})</span>
            </h2>
            <p className="text-xs text-ink-2">{hint}</p>
          </div>
        </div>
        {summary}
      </div>

      {accounts.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="scroll-y -m-1 grid content-start gap-3 p-1 sm:grid-cols-2">
          {accounts.map((account) => (
            <li key={account.id} className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-2 text-sm text-ink-2">
                {account.is_manual ? (
                  <Wallet className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Building2 className="h-4 w-4 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {account.is_manual
                    ? 'Conta manual'
                    : (account.bank_connection?.institution_name ?? 'Instituição desconhecida')}
                </span>
                {account.is_manual && onEditManual && (
                  <button
                    type="button"
                    onClick={() => onEditManual(account)}
                    className="-m-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink"
                    aria-label={`Editar conta ${account.name ?? ''}`}
                    title="Editar conta manual"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <p className="mt-2 truncate font-medium text-ink">{account.name ?? 'Conta'}</p>
              <p className="text-xs text-ink-3">
                {TYPE_LABELS[(account.type ?? '').toUpperCase()] ?? account.type ?? '—'}
              </p>
              <p className="mt-3 text-xs text-ink-2">{credit ? 'A pagar' : 'Saldo'}</p>
              <p className={`num text-xl font-semibold ${credit ? 'text-danger-ink' : 'text-ink'}`}>
                {formatCurrency(credit ? Math.abs(account.balance ?? 0) : account.balance)}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Atualizada em {formatDate(account.updated_at.slice(0, 10))}
                {account.is_manual && (
                  <>
                    {' · '}
                    <Link
                      to={`/transacoes?lancar=${account.id}`}
                      className="font-medium text-ink underline underline-offset-4 hover:text-accent"
                    >
                      Lançar
                    </Link>
                  </>
                )}
              </p>
              {credit && onEditCard && <CardDays account={account} onEdit={() => onEditCard(account)} />}
              <OwnerSelect account={account} owners={owners} onChange={onChangeOwner} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** Fechamento e vencimento do cartão, com o próximo ciclo calculado. */
function CardDays({ account, onEdit }: { account: AccountWithConnection; onEdit: () => void }) {
  const cycle = account.closing_day ? nextCardCycle(account.closing_day, account.due_day) : null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Fatura
          {!account.closing_day && <span className="font-medium text-warn-ink">· defina o fechamento</span>}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="-m-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink"
          aria-label={`Editar fechamento e vencimento de ${account.name ?? 'cartão'}`}
          title="Editar fechamento e vencimento"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {cycle ? (
        <p className="mt-1 text-sm text-ink">
          Fecha dia {account.closing_day}
          {account.due_day ? ` · vence dia ${account.due_day}` : ''}
          <span className="block text-xs text-ink-3">
            Próxima: fecha {SHORT_DATE.format(cycle.closing)}
            {cycle.due ? `, vence ${SHORT_DATE.format(cycle.due)}` : ''}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-ink-3">Sem fechamento, as compras contam na data em que foram feitas.</p>
      )}
    </div>
  );
}

function OwnerSelect({
  account,
  owners,
  onChange,
}: {
  account: AccountWithConnection;
  owners: AccountOwner[];
  onChange: (accountId: string, ownerId: string | null) => void;
}) {
  const owner = owners.find((candidate) => candidate.id === account.owner_id) ?? null;
  const missing = !owner && !account.is_manual;
  const id = `owner-${account.id}`;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs text-ink-2">
        <OwnerDot owner={owner} />
        Responsável
        {missing && <span className="font-medium text-warn-ink">· obrigatório</span>}
      </label>
      <select
        id={id}
        className={`field py-1.5 ${missing ? 'border-warn-ink/50' : ''}`}
        value={account.owner_id ?? ''}
        onChange={(event) => onChange(account.id, event.target.value || null)}
        disabled={owners.length === 0}
      >
        <option value="">{owners.length === 0 ? 'Cadastre em "Responsáveis"' : 'Sem responsável'}</option>
        {owners.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function describeSync(result: SyncResult): string {
  if (result.transactionsInserted === 0) {
    return 'Sincronizado: nenhuma transação nova.';
  }
  const plural = result.transactionsInserted === 1 ? 'nova transação' : 'novas transações';
  return `Sincronizado: ${result.transactionsInserted} ${plural} aguardando conciliação.`;
}

function lastSyncLabel(connections: BankConnection[]): string {
  const timestamps = connections
    .map((connection) => connection.last_synced_at)
    .filter((value): value is string => Boolean(value));

  if (timestamps.length === 0) return '';

  const mostRecent = timestamps.sort().at(-1) as string;
  return ` Última sincronização em ${new Date(mostRecent).toLocaleString('pt-BR')}.`;
}
