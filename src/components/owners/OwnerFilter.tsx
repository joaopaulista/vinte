import { useSearchParams } from 'react-router-dom';
import { OwnerDot } from './OwnerDot';
import type { AccountOwner, TransactionWithRelations } from '@/types';

/** 'all' = todos; 'none' = contas sem responsável; senão, o id do responsável. */
export type OwnerFilterValue = string;

const STORAGE_KEY = 'vinte.owner-filter';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Responsável escolhido, guardado na URL (`?responsavel=`) para dar para
 * compartilhar o link e lembrado no navegador para a próxima visita.
 * Um id que não existe mais (responsável excluído) volta para "todos".
 */
export function useOwnerFilter(
  owners: AccountOwner[],
  loading: boolean,
): [OwnerFilterValue, (value: OwnerFilterValue) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('responsavel') ?? readStored() ?? 'all';
  const valid = raw === 'all' || raw === 'none' || owners.some((owner) => owner.id === raw);
  // Enquanto os responsáveis carregam, mantém o valor pedido. Sem nenhum
  // responsável cadastrado não há filtro (nem seletor) para mostrar.
  const value = loading ? raw : valid && owners.length > 0 ? raw : 'all';

  function set(next: OwnerFilterValue) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sem armazenamento (aba anônima): fica só na URL.
    }
    const updated = new URLSearchParams(params);
    if (next === 'all') updated.delete('responsavel');
    else updated.set('responsavel', next);
    setParams(updated, { replace: true });
  }

  return [value, set];
}

export function filterByOwner<T extends Pick<TransactionWithRelations, 'account'>>(
  transactions: T[],
  value: OwnerFilterValue,
): T[] {
  if (value === 'all') return transactions;
  if (value === 'none') return transactions.filter((transaction) => !transaction.account?.owner_id);
  return transactions.filter((transaction) => transaction.account?.owner_id === value);
}

/** Seletor de responsável. Não aparece enquanto não houver responsáveis cadastrados. */
export function OwnerFilter({
  owners,
  value,
  onChange,
  id = 'owner-filter',
}: {
  owners: AccountOwner[];
  value: OwnerFilterValue;
  onChange: (value: OwnerFilterValue) => void;
  id?: string;
}) {
  if (owners.length === 0) return null;
  const selected = owners.find((owner) => owner.id === value) ?? null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm text-ink-2">
        {value !== 'all' && <OwnerDot owner={selected} />}
        Responsável
      </label>
      <select
        id={id}
        className={`field w-auto py-1.5 ${value !== 'all' ? 'border-accent' : ''}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">Todos</option>
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name}
          </option>
        ))}
        <option value="none">Sem responsável</option>
      </select>
    </div>
  );
}
