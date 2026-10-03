import { currentMonthKey, monthKeyOf } from './analytics';
import { formatMonthLabel } from './format';
import { splitDescription, stripInstallment } from './merchant';
import type { TransactionWithRelations } from '@/types';

/**
 * Faturas do cartão mês a mês: as dos meses anteriores (o que foi lançado)
 * e a previsão das próximas (o lançado mais as parcelas que ainda vão vir).
 *
 * O banco manda cada parcela quando ela entra na fatura. Uma compra em 8x
 * que está na parcela 6 ainda tem a 7 e a 8 pela frente — elas não existem
 * como transação, mas vão existir. A previsão pega a parcela mais recente
 * de cada compra e projeta as que faltam, uma por mês.
 *
 * Quando a parcela seguinte chega de verdade, ela passa a ser a "mais
 * recente" e a projeção recomeça dali — então nunca conta em dobro.
 */

/** Meses anteriores no gráfico. O histórico do cartão vem da sincronização (90 dias). */
const PAST_MONTHS = 6;
/** Mês atual + próximos. */
const FORECAST_MONTHS = 12;

export interface ForecastMonth {
  key: string;
  label: string;
  /** Compras e parcelas que já apareceram na fatura daquele mês. */
  posted: number;
  /** Parcelas futuras projetadas. */
  projected: number;
  /** Mês já encerrado: a coluna mostra a fatura que foi, não uma previsão. */
  past: boolean;
}

export interface InstallmentPurchase {
  key: string;
  name: string;
  accountName: string | null;
  /** Parcela mais recente que o banco mandou. */
  current: number;
  total: number;
  installmentValue: number;
  remaining: number;
  remainingTotal: number;
  /** 'YYYY-MM' da última parcela. */
  lastMonth: string;
}

export interface CardForecast {
  months: ForecastMonth[];
  purchases: InstallmentPurchase[];
  /** Soma de todas as parcelas que ainda vão vir. */
  remainingTotal: number;
  /** 'YYYY-MM' do mês atual. */
  currentKey: string;
  /** Média das faturas dos meses anteriores que tiveram lançamento. */
  pastAverage: number;
  hasCard: boolean;
}

function isCard(transaction: TransactionWithRelations): boolean {
  const type = (transaction.account?.type ?? '').toUpperCase();
  return type === 'CREDIT_CARD' || type === 'CREDIT';
}

function addMonths(key: string, count: number): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Mês da fatura em que a parcela cai. Alguns bancos datam todas as parcelas
 * com o dia da compra; nesse caso a parcela 6 é "mês da compra + 5".
 */
function billMonth(transaction: TransactionWithRelations): string {
  const month = monthKeyOf(transaction.transaction_date);
  const number = transaction.installment_number ?? 1;
  if (transaction.purchase_date && number > 1 && monthKeyOf(transaction.purchase_date) === month) {
    return addMonths(month, number - 1);
  }
  return month;
}

function purchaseName(description: string | null): string {
  return stripInstallment(splitDescription(description).name);
}

export function buildCardForecast(
  transactions: TransactionWithRelations[],
  reference = new Date(),
): CardForecast {
  const thisMonth = currentMonthKey(reference);
  const firstMonth = addMonths(thisMonth, -PAST_MONTHS);
  const monthKeys = Array.from({ length: PAST_MONTHS + FORECAST_MONTHS }, (_, index) =>
    addMonths(firstMonth, index),
  );
  const posted = new Map<string, number>();
  const projected = new Map<string, number>();
  const latest = new Map<string, TransactionWithRelations>();

  const cardExpenses = transactions.filter(
    (transaction) =>
      isCard(transaction) &&
      transaction.amount < 0 &&
      !transaction.bill_payment &&
      transaction.reconciliation_status !== 'rejected',
  );

  for (const transaction of cardExpenses) {
    const month = billMonth(transaction);
    if (month >= firstMonth) {
      posted.set(month, (posted.get(month) ?? 0) + Math.abs(transaction.amount));
    }

    const total = transaction.total_installments ?? 1;
    if (total <= 1) continue;

    // A mesma compra em parcelas diferentes: mesma conta, mesmo nome, mesmo
    // número de parcelas e mesma data de compra (ou, sem ela, mesmo valor).
    const key = [
      transaction.account?.id ?? '',
      purchaseName(transaction.description).toLowerCase(),
      total,
      transaction.purchase_date ?? Math.abs(transaction.amount).toFixed(2),
    ].join('|');

    const known = latest.get(key);
    if (!known || (transaction.installment_number ?? 0) > (known.installment_number ?? 0)) {
      latest.set(key, transaction);
    }
  }

  const purchases: InstallmentPurchase[] = [];

  for (const [key, transaction] of latest) {
    const current = transaction.installment_number ?? 1;
    const total = transaction.total_installments ?? 1;
    const value = Math.abs(transaction.amount);
    const base = billMonth(transaction);
    let remaining = 0;

    for (let next = current + 1; next <= total; next += 1) {
      const month = addMonths(base, next - current);
      if (month < thisMonth) continue; // parcela que já deveria ter aparecido
      projected.set(month, (projected.get(month) ?? 0) + value);
      remaining += 1;
    }

    if (remaining === 0 && base < thisMonth) continue; // compra já quitada

    purchases.push({
      key,
      name: purchaseName(transaction.description) || 'Compra parcelada',
      accountName: transaction.account?.name ?? null,
      current,
      total,
      installmentValue: round2(value),
      remaining,
      remainingTotal: round2(value * remaining),
      lastMonth: addMonths(base, total - current),
    });
  }

  purchases.sort((a, b) => b.remainingTotal - a.remainingTotal || a.name.localeCompare(b.name));

  const pastWithData = monthKeys
    .filter((key) => key < thisMonth && (posted.get(key) ?? 0) > 0)
    .map((key) => posted.get(key) ?? 0);

  return {
    months: monthKeys.map((key) => ({
      key,
      label: formatMonthLabel(`${key}-01`),
      posted: round2(posted.get(key) ?? 0),
      projected: round2(projected.get(key) ?? 0),
      past: key < thisMonth,
    })),
    purchases,
    remainingTotal: round2(purchases.reduce((sum, purchase) => sum + purchase.remainingTotal, 0)),
    currentKey: thisMonth,
    pastAverage: pastWithData.length
      ? round2(pastWithData.reduce((sum, value) => sum + value, 0) / pastWithData.length)
      : 0,
    hasCard: transactions.some(isCard),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
