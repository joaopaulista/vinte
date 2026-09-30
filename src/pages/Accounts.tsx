import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { ConnectBankButton } from '@/components/accounts/ConnectBankButton';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { Pagination } from '@/components/common/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { fetchAccounts, fetchBankConnections } from '@/services/accountsService';
import { syncTransactions } from '@/services/pluggyService';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { formatCurrency, formatDate } from '@/utils/format';
import type { AccountWithConnection, BankConnection, SyncResult } from '@/types';

export default function Accounts() {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [accounts, setAccounts] = useState<AccountWithConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
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

  async function handleManualSync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      await afterSync(await syncTransactions());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  const pagination = usePagination(accounts, 9);
  const totalBalance = accounts.reduce((sum, account) => sum + (account.balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Contas</h1>
          <p className="mt-1 text-sm text-ink-2">
            Bancos conectados via Open Finance e respectivas contas.
          </p>
        </div>
        <ConnectBankButton onConnected={afterSync} />
      </header>

      {notice && (
        <div className="card border-success/30 bg-success-surface p-4 text-sm text-success-ink">
          {notice}
        </div>
      )}

      {error && (
        <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
      )}

      {loading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Wallet}
            title="Nenhuma conta conectada"
            description="Use 'Conectar banco' para abrir o Pluggy Connect. No ambiente Sandbox, escolha um conector de teste e use as credenciais de sandbox do Pluggy."
          />
        </div>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-ink-2">Saldo consolidado</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {formatCurrency(totalBalance)}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'} em{' '}
                {connections.length} {connections.length === 1 ? 'conexão' : 'conexões'}
                {lastSyncLabel(connections)}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleManualSync()}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Sincronizar agora
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagination.pageItems.map((account) => (
              <div key={account.id} className="card p-5">
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <Building2 className="h-4 w-4" aria-hidden />
                  <span className="truncate">
                    {account.bank_connection?.institution_name ?? 'Instituição desconhecida'}
                  </span>
                </div>
                <p className="mt-2 font-medium text-ink">{account.name ?? 'Conta'}</p>
                <p className="text-xs text-ink-3">{account.type ?? '—'}</p>
                <p className="mt-3 text-xl font-semibold text-ink">
                  {formatCurrency(account.balance)}
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  Atualizada em {formatDate(account.updated_at.slice(0, 10))}
                </p>
              </div>
            ))}
          </div>

          <Pagination state={pagination} noun="contas" hideSizeSelector />
        </>
      )}
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
  return ` · última sincronização em ${new Date(mostRecent).toLocaleString('pt-BR')}`;
}
