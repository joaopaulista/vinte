import { useCallback, useEffect, useState } from 'react';
import { Building2, Wallet } from 'lucide-react';
import { ConnectBankButton } from '@/components/accounts/ConnectBankButton';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { Pagination } from '@/components/common/Pagination';
import { PageHeader } from '@/components/common/PageHeader';
import { usePagination } from '@/hooks/usePagination';
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

  const pagination = usePagination(accounts, 9);
  const totalBalance = accounts.reduce((sum, account) => sum + (account.balance ?? 0), 0);

  return (
    <div className="page">
      <PageHeader
        title="Contas"
        description="Bancos conectados via Open Finance e respectivas contas."
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
        <>
          <div className="card flex shrink-0 flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm text-ink-2">Saldo consolidado</p>
              <p className="mt-1 num text-2xl font-semibold text-ink">
                {formatCurrency(totalBalance)}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'} em{' '}
                {connections.length} {connections.length === 1 ? 'conexão' : 'conexões'}
                {lastSyncLabel(connections)}
              </p>
              <p className="mt-1 text-xs text-ink-3">Para atualizar, clique no logo do VINTE no menu.</p>
            </div>
          </div>

          <div className="scroll-y -m-1 grid content-start gap-4 p-1 md:grid-cols-2 xl:grid-cols-3">
            {pagination.pageItems.map((account) => (
              <div key={account.id} className="card p-4">
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <Building2 className="h-4 w-4" aria-hidden />
                  <span className="truncate">
                    {account.bank_connection?.institution_name ?? 'Instituição desconhecida'}
                  </span>
                </div>
                <p className="mt-2 font-medium text-ink">{account.name ?? 'Conta'}</p>
                <p className="text-xs text-ink-3">{account.type ?? '—'}</p>
                <p className="mt-3 num text-xl font-semibold text-ink">
                  {formatCurrency(account.balance)}
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  Atualizada em {formatDate(account.updated_at.slice(0, 10))}
                </p>
              </div>
            ))}
          </div>

          <Pagination state={pagination} noun="contas" />
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
