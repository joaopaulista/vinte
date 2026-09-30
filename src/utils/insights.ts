import { formatMonthLabel } from './format';
import { derivePattern } from './merchant';
import { lastMonthKeys, monthKeyOf } from './analytics';
import type { TransactionWithRelations } from '@/types';

/** Métrica escolhida clicando num KPI; é ela que o gráfico de evolução mostra. */
export type Metric = 'expense' | 'income' | 'balance' | 'savings';

export interface Summary {
  income: number;
  expense: number;
  balance: number;
  /** Fração da receita que sobrou (0.25 = 25%). null sem receita no recorte. */
  savings: number | null;
  count: number;
  /** Despesa média por lançamento de saída. */
  averageExpense: number;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Transferência entre contas não é receita nem despesa: se entrar na conta,
 * o mesmo dinheiro aparece duas vezes (saiu de uma, entrou na outra).
 */
export function isTransfer(transaction: TransactionWithRelations): boolean {
  const name = transaction.category?.name;
  return name ? normalize(name).includes('transfer') : false;
}

export function summarize(transactions: TransactionWithRelations[]): Summary {
  let income = 0;
  let expense = 0;
  let expenseCount = 0;

  for (const transaction of transactions) {
    if (transaction.amount >= 0) {
      income += transaction.amount;
    } else {
      expense += Math.abs(transaction.amount);
      expenseCount += 1;
    }
  }

  const balance = income - expense;
  return {
    income: round2(income),
    expense: round2(expense),
    balance: round2(balance),
    savings: income > 0 ? balance / income : null,
    count: transactions.length,
    averageExpense: expenseCount > 0 ? round2(expense / expenseCount) : 0,
  };
}

export function metricValue(summary: Summary, metric: Metric): number | null {
  if (metric === 'savings') return summary.savings;
  return summary[metric];
}

export interface MonthlyPoint {
  key: string;
  label: string;
  value: number | null;
}

/** Uma barra por mês, com a métrica selecionada. */
export function monthlyMetric(
  transactions: TransactionWithRelations[],
  monthKeys: string[],
  metric: Metric,
): MonthlyPoint[] {
  const byMonth = new Map<string, TransactionWithRelations[]>();
  for (const transaction of transactions) {
    const key = monthKeyOf(transaction.transaction_date);
    const bucket = byMonth.get(key) ?? [];
    bucket.push(transaction);
    byMonth.set(key, bucket);
  }

  return monthKeys.map((key) => {
    const value = metricValue(summarize(byMonth.get(key) ?? []), metric);
    return {
      key,
      label: formatMonthLabel(`${key}-01`),
      value: value === null ? null : metric === 'savings' ? value * 100 : value,
    };
  });
}

export interface RankedItem {
  /** Id da categoria, quando o item é uma categoria (permite o drill-down). */
  id: string | null;
  name: string;
  total: number;
  share: number;
}

/**
 * Soma despesas agrupando pela chave pedida e devolve do maior para o menor.
 * O que passar de `limit` vira uma linha "Outros", nunca mais uma barra.
 */
function rankExpenses(
  transactions: TransactionWithRelations[],
  keyOf: (transaction: TransactionWithRelations) => { id: string | null; name: string },
  limit: number,
): RankedItem[] {
  const totals = new Map<string, RankedItem>();
  let grandTotal = 0;

  for (const transaction of transactions) {
    if (transaction.amount >= 0) continue;
    const value = Math.abs(transaction.amount);
    const { id, name } = keyOf(transaction);
    const mapKey = id ?? `name:${name}`;
    const item = totals.get(mapKey) ?? { id, name, total: 0, share: 0 };
    item.total += value;
    totals.set(mapKey, item);
    grandTotal += value;
  }

  const ranked = [...totals.values()]
    .map((item) => ({
      ...item,
      total: round2(item.total),
      share: grandTotal > 0 ? item.total / grandTotal : 0,
    }))
    .sort((a, b) => b.total - a.total);

  if (ranked.length <= limit) return ranked;

  const tail = ranked.slice(limit);
  const tailTotal = tail.reduce((sum, item) => sum + item.total, 0);
  return [
    ...ranked.slice(0, limit),
    {
      id: null,
      name: `Outros (${tail.length})`,
      total: round2(tailTotal),
      share: grandTotal > 0 ? tailTotal / grandTotal : 0,
    },
  ];
}

export function expensesByCategory(transactions: TransactionWithRelations[], limit = 10) {
  return rankExpenses(
    transactions,
    (transaction) => ({
      id: transaction.category?.id ?? null,
      name: transaction.category?.name ?? 'Sem categoria',
    }),
    limit,
  );
}

export function expensesBySubcategory(transactions: TransactionWithRelations[], limit = 10) {
  return rankExpenses(
    transactions,
    (transaction) => ({
      id: transaction.subcategory?.id ?? null,
      name: transaction.subcategory?.name ?? 'Sem subcategoria',
    }),
    limit,
  );
}

/** Agrupa pelo "apelido" do estabelecimento, sem o ruído de datas e códigos. */
export function expensesByMerchant(transactions: TransactionWithRelations[], limit = 8) {
  return rankExpenses(
    transactions,
    (transaction) => {
      const pattern = derivePattern(transaction.description);
      return {
        id: null,
        name: pattern ? pattern.toUpperCase() : (transaction.description ?? 'Sem descrição'),
      };
    },
    limit,
  );
}

/** Meses do período atual e do período anterior de mesmo tamanho. */
export function periodKeys(months: number, reference = new Date()) {
  const all = lastMonthKeys(months * 2, reference);
  return { previous: all.slice(0, months), current: all.slice(months) };
}

export function inMonths(
  transactions: TransactionWithRelations[],
  keys: string[],
): TransactionWithRelations[] {
  const set = new Set(keys);
  return transactions.filter((transaction) => set.has(monthKeyOf(transaction.transaction_date)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
