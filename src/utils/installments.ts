import type { TransactionWithRelations } from '@/types';

/**
 * Chave da compra parcelada: as parcelas da mesma compra têm a mesma chave.
 * Espelha `installment_key` da migration 0018 — mesma conta, mesmo título
 * sem a marcação de parcela, mesmo total de parcelas e mesma data de compra
 * (sem ela, mesmo valor em reais). Nulo para compra à vista.
 */
export function installmentKey(transaction: TransactionWithRelations): string | null {
  const total = transaction.total_installments ?? 1;
  if (total <= 1) return null;
  const base = (transaction.description ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/(parc(ela)?\.?\s*)?\b\d{1,2}\s*(\/|de)\s*\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const purchase = transaction.purchase_date ?? String(Math.round(Math.abs(transaction.amount)));
  return [transaction.account_id, base, total, purchase].join('|');
}

/**
 * Agrupa as parcelas pendentes por compra. Cada compra fica representada pela
 * parcela de menor número; as demais vêm em `siblings` e são conciliadas
 * junto com ela (o banco aplica a mesma decisão — migration 0018).
 */
export function groupInstallments(transactions: TransactionWithRelations[]) {
  const groups = new Map<string, TransactionWithRelations[]>();
  for (const transaction of transactions) {
    const key = installmentKey(transaction);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  const siblings = new Map<string, TransactionWithRelations[]>();
  const hidden = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0) || a.transaction_date.localeCompare(b.transaction_date),
    );
    const [first, ...others] = sorted;
    siblings.set(first.id, others);
    for (const other of others) hidden.add(other.id);
  }
  return {
    /** A fila sem as parcelas que vão junto com outra. */
    visible: transactions.filter((transaction) => !hidden.has(transaction.id)),
    /** Parcelas que acompanham cada parcela visível. */
    siblingsOf: (id: string) => siblings.get(id) ?? [],
  };
}
