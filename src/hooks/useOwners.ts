import { useCallback, useEffect, useState } from 'react';
import { fetchOwners } from '@/services/ownersService';
import type { AccountOwner } from '@/types';

/** Responsáveis cadastrados. Sem a migration 0012 aplicada, volta lista vazia e um erro. */
export function useOwners() {
  const [owners, setOwners] = useState<AccountOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setOwners(await fetchOwners());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar responsáveis');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { owners, loading, error, reload };
}
