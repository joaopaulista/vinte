import { formatMonthLabel } from './format';
import type { TransactionWithRelations } from '@/types';

export interface MonthlyTotals {
  /** 'YYYY-MM' */
  key: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
}

export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function currentMonthKey(reference = new Date()): string {
  return `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}`;
}

/** Lista de chaves 'YYYY-MM' terminando no mês corrente. */
export function lastMonthKeys(count: number, reference = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - (count - 1 - index), 1);
    return currentMonthKey(date);
  });
}

/**
 * Agrega por mês. Despesas são devolvidas como valor positivo — o sinal já é
 * informação do eixo/legenda, e barras negativas atrapalhariam a leitura.
 */
export function buildMonthlySeries(
  transactions: TransactionWithRelations[],
  monthCount: number,
): MonthlyTotals[] {
  const totals = new Map<string, { income: number; expense: number }>();

  for (const transaction of transactions) {
    const key = monthKeyOf(transaction.transaction_date);
    const bucket = totals.get(key) ?? { income: 0, expense: 0 };

    if (transaction.amount >= 0) {
      bucket.income += transaction.amount;
    } else {
      bucket.expense += Math.abs(transaction.amount);
    }

    totals.set(key, bucket);
  }

  return lastMonthKeys(monthCount).map((key) => {
    const bucket = totals.get(key) ?? { income: 0, expense: 0 };
    return {
      key,
      label: formatMonthLabel(`${key}-01`),
      income: round2(bucket.income),
      expense: round2(bucket.expense),
      balance: round2(bucket.income - bucket.expense),
    };
  });
}

export interface CategoryTotal {
  name: string;
  total: number;
}

/**
 * Soma as despesas por categoria pai. O que sobra além de `topCount` vira uma
 * fatia "Outras" em vez de virar mais uma cor no gráfico.
 */
export function sumExpensesByCategory(
  transactions: TransactionWithRelations[],
  topCount = 8,
): CategoryTotal[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.amount >= 0) continue;
    const name = transaction.category?.name ?? 'Sem categoria';
    totals.set(name, (totals.get(name) ?? 0) + Math.abs(transaction.amount));
  }

  const ranked = [...totals.entries()]
    .map(([name, total]) => ({ name, total: round2(total) }))
    .sort((a, b) => b.total - a.total);

  if (ranked.length <= topCount) return ranked;

  const head = ranked.slice(0, topCount);
  const tail = ranked.slice(topCount);
  head.push({
    name: 'Outras',
    total: round2(tail.reduce((sum, item) => sum + item.total, 0)),
  });

  return head;
}

export interface CategoryAnomaly {
  name: string;
  /** Gasto no mês corrente, até hoje. */
  current: number;
  /** Média do mesmo intervalo de dias nos meses anteriores. */
  baseline: number;
  /** Quanto o mês corrente está acima da média, em reais. */
  delta: number;
  /** current / baseline. 1.8 = 80% acima do normal. */
  ratio: number;
}

/** Acima disso já chama atenção; abaixo é variação normal de mês para mês. */
const ANOMALY_RATIO = 1.4;
/** Piso em reais: 60% a mais numa categoria de R$ 20 não é notícia. */
const ANOMALY_MIN_DELTA = 100;

/**
 * Aponta categorias com gasto fora do normal no mês corrente.
 *
 * A comparação é **do mesmo intervalo de dias**: no dia 8, o mês corrente é
 * comparado com os dias 1 a 8 dos meses anteriores. Comparar um mês pela metade
 * com meses inteiros esconderia qualquer anomalia até o fim do mês.
 */
export function detectAnomalies(
  transactions: TransactionWithRelations[],
  reference = new Date(),
  baselineMonths = 3,
): CategoryAnomaly[] {
  const dayCutoff = reference.getDate();
  const thisMonth = currentMonthKey(reference);
  const baselineKeys = new Set(
    Array.from({ length: baselineMonths }, (_, index) =>
      currentMonthKey(new Date(reference.getFullYear(), reference.getMonth() - (index + 1), 1)),
    ),
  );

  const current = new Map<string, number>();
  const baselineTotals = new Map<string, Map<string, number>>();

  for (const transaction of transactions) {
    if (transaction.amount >= 0) continue;

    const day = Number(transaction.transaction_date.slice(8, 10));
    if (day > dayCutoff) continue;

    const monthKey = monthKeyOf(transaction.transaction_date);
    const name = transaction.category?.name ?? 'Sem categoria';
    const value = Math.abs(transaction.amount);

    if (monthKey === thisMonth) {
      current.set(name, (current.get(name) ?? 0) + value);
    } else if (baselineKeys.has(monthKey)) {
      const perMonth = baselineTotals.get(name) ?? new Map<string, number>();
      perMonth.set(monthKey, (perMonth.get(monthKey) ?? 0) + value);
      baselineTotals.set(name, perMonth);
    }
  }

  const anomalies: CategoryAnomaly[] = [];

  for (const [name, currentValue] of current) {
    const perMonth = baselineTotals.get(name);
    if (!perMonth || perMonth.size === 0) continue;

    // Divide pelos meses em que a categoria realmente apareceu: uma categoria
    // que só existe há dois meses não deve ter a média diluída por um terceiro.
    const baseline =
      [...perMonth.values()].reduce((sum, value) => sum + value, 0) / perMonth.size;
    if (baseline <= 0) continue;

    const delta = currentValue - baseline;
    const ratio = currentValue / baseline;

    if (ratio >= ANOMALY_RATIO && delta >= ANOMALY_MIN_DELTA) {
      anomalies.push({
        name,
        current: round2(currentValue),
        baseline: round2(baseline),
        delta: round2(delta),
        ratio,
      });
    }
  }

  return anomalies.sort((a, b) => b.delta - a.delta).slice(0, 3);
}

export function filterByMonth(
  transactions: TransactionWithRelations[],
  key: string,
): TransactionWithRelations[] {
  return transactions.filter((transaction) => monthKeyOf(transaction.transaction_date) === key);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
