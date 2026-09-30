import { useCallback, useEffect, useState } from 'react';
import { fetchTransactions } from '@/services/transactionsService';
import type { FetchTransactionsOptions } from '@/services/transactionsService';
import type { TransactionWithRelations } from '@/types';

interface UseTransactionsResult {
  transactions: TransactionWithRelations[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * `options` costuma ser recriado a cada render, então serializamos para não
 * disparar um fetch a cada renderização do componente pai.
 */
export function useTransactions(options: FetchTransactionsOptions = {}): UseTransactionsResult {
  const optionsKey = JSON.stringify(options);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTransactions(await fetchTransactions(JSON.parse(optionsKey)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar transações');
    } finally {
      setLoading(false);
    }
  }, [optionsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { transactions, loading, error, reload };
}
