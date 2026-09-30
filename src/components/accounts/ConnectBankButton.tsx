import { useState } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import { Loader2, Plug } from 'lucide-react';
import { fetchConnectToken, syncTransactions } from '@/services/pluggyService';
import type { SyncResult } from '@/services/pluggyService';

/**
 * No ambiente Sandbox do Pluggy os conectores de teste só aparecem no widget
 * quando `includeSandbox` está ligado. Em produção isso precisa ficar false.
 */
const INCLUDE_SANDBOX = import.meta.env.VITE_PLUGGY_INCLUDE_SANDBOX !== 'false';

interface ConnectBankButtonProps {
  onConnected: (result: SyncResult) => void | Promise<void>;
}

export function ConnectBankButton({ onConnected }: ConnectBankButtonProps) {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'syncing'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function openWidget() {
    setPhase('opening');
    setError(null);
    try {
      setConnectToken(await fetchConnectToken());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o Pluggy.');
    } finally {
      setPhase('idle');
    }
  }

  async function handleSuccess(itemData: { item: { id: string } }) {
    // Fecha o widget antes de sincronizar: o extrato pode demorar alguns segundos.
    setConnectToken(null);
    setPhase('syncing');
    setError(null);

    try {
      await onConnected(await syncTransactions(itemData.item.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Banco conectado, mas a sincronização falhou: ${cause.message}`
          : 'Banco conectado, mas a sincronização falhou.',
      );
    } finally {
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" className="btn-primary" onClick={openWidget} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Plug className="h-4 w-4" aria-hidden />
        )}
        {phase === 'syncing' ? 'Sincronizando…' : 'Conectar banco'}
      </button>

      {error && <p className="max-w-md text-right text-sm text-danger-ink">{error}</p>}

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={INCLUDE_SANDBOX}
          onSuccess={handleSuccess}
          onClose={() => setConnectToken(null)}
          onError={(pluggyError: { message?: string }) => {
            setConnectToken(null);
            setError(pluggyError?.message ?? 'O Pluggy retornou um erro na conexão.');
          }}
        />
      )}
    </div>
  );
}
