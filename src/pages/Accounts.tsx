import { useCallback, useEffect, useState } from 'react';
import { Building2, CreditCard, Landmark, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConnectBankButton } from '@/components/accounts/ConnectBankButton';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { PageHeader } from '@/components/common/PageHeader';
import { fetchAccounts, fetchBankConnections } from '@/services/accountsService';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { formatCurrency, formatDate } from '@/utils/format';
import type { AccountWithConnection, BankConnection, SyncResult } from '@/types';

export default function Accounts() {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [accounts, setAccounts] = useState<AccountWithConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { refreshPendingCount } = usePendingCount();

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

  return (
    <div className="page">
      <PageHeader
        title="Contas"
        description={
          <>
            Bancos conectados via Open Finance, separados entre débito e crédito.
            {lastSyncLabel(connections)} Para atualizar, clique no logo do VINTE no menu.
          </>
        }
        actions={<ConnectBankButton onConnected={afterSync} />}
      />

      {notice && (
        <div className="card shrink-0 border-success/30 bg-success-surface p-3 text-sm text-success-ink">
          {notice}
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
            title="Nenhuma conta conectada"
            description="Use 'Conectar banco' para abrir o Pluggy Connect. No ambiente Sandbox, escolha um conector de teste e use as credenciais de sandbox do Pluggy."
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
          />
        </div>
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
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  accounts: AccountWithConnection[];
  empty: string;
  summary?: ReactNode;
  credit?: boolean;
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
                <Building2 className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{account.bank_connection?.institution_name ?? 'Instituição desconhecida'}</span>
              </div>
              <p className="mt-2 truncate font-medium text-ink">{account.name ?? 'Conta'}</p>
              <p className="text-xs text-ink-3">
                {TYPE_LABELS[(account.type ?? '').toUpperCase()] ?? account.type ?? '—'}
              </p>
              <p className="mt-3 text-xs text-ink-2">{credit ? 'A pagar' : 'Saldo'}</p>
              <p className={`num text-xl font-semibold ${credit ? 'text-danger-ink' : 'text-ink'}`}>
                {formatCurrency(credit ? Math.abs(account.balance ?? 0) : account.balance)}
              </p>
              <p className="mt-1 text-xs text-ink-3">Atualizada em {formatDate(account.updated_at.slice(0, 10))}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
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
