import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { countPendingTransactions } from '@/services/transactionsService';

interface PendingCountValue {
  pendingCount: number;
  refreshPendingCount: () => Promise<void>;
}

const PendingCountContext = createContext<PendingCountValue>({
  pendingCount: 0,
  refreshPendingCount: async () => {},
});

/**
 * Mantém o contador de pendências do menu em sincronia com a tela de
 * Conciliação, que chama `refreshPendingCount` a cada aprovação/reprovação.
 */
export function PendingCountProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    try {
      setPendingCount(await countPendingTransactions());
    } catch {
      // O contador é informativo; um erro aqui não deve derrubar a navegação.
    }
  }, []);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  const value = useMemo(
    () => ({ pendingCount, refreshPendingCount }),
    [pendingCount, refreshPendingCount],
  );

  return <PendingCountContext.Provider value={value}>{children}</PendingCountContext.Provider>;
}

export function usePendingCount(): PendingCountValue {
  return useContext(PendingCountContext);
}
