/**
 * Natureza da conta, para filtrar transações:
 *  - crédito: cartão de crédito;
 *  - dinheiro: conta manual do tipo "Dinheiro" (espécie);
 *  - débito: o resto (corrente, poupança, investimento…).
 */
export type AccountKind = 'debit' | 'credit' | 'cash';

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  debit: 'Débito',
  credit: 'Crédito',
  cash: 'Dinheiro',
};

export function accountKindOf(type: string | null | undefined): AccountKind {
  const normalized = (type ?? '').toUpperCase();
  if (normalized === 'CREDIT_CARD' || normalized === 'CREDIT') return 'credit';
  if (normalized === 'CASH') return 'cash';
  return 'debit';
}
