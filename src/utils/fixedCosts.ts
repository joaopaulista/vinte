import { derivePattern } from './merchant';
import { currentMonthKey, lastMonthKeys, monthKeyOf } from './analytics';
import type { TransactionWithRelations } from '@/types';

/**
 * Detecção de custos fixos — o que você paga todo mês.
 *
 * Não é ML: é uma regra legível, para dar para entender por que algo entrou
 * (ou não) na lista. Um gasto é fixo quando, agrupado pelo "apelido" do
 * estabelecimento (o mesmo das regras de categorização):
 *
 *   1. aparece na maioria dos meses de histórico (≥ 75%, mínimo 2 meses);
 *   2. acontece ~1 vez por mês — supermercado aparece todo mês, mas 8 vezes,
 *      e não é conta fixa;
 *   3. o total do mês é estável (variação ≤ 30%). Até 15% é "valor fixo"
 *      (aluguel, assinatura); entre 15% e 30% é "valor variável" (luz, água);
 *      Além disso, o maior mês não pode passar de 1,8× o menor: conta de luz
 *      oscila, mas não dobra de um mês para o outro;
 *   4. cai perto do mesmo dia todo mês (desvio mediano ≤ 5 dias). Conta tem
 *      vencimento; a ida ao cinema uma vez por mês cai em qualquer dia.
 *
 * O mês corrente não entra no histórico (está pela metade), mas é usado para
 * dizer se a conta deste mês já foi paga.
 */

const HISTORY_MONTHS = 6;
const MIN_PRESENCE_RATIO = 0.75;
const MAX_OCCURRENCES_PER_MONTH = 1.5;
const FIXED_AMOUNT_CV = 0.15;
const MAX_CV = 0.3;
const MAX_DAY_DEVIATION = 5;
const MAX_RANGE_RATIO = 1.8;
/** Dias de tolerância depois do dia típico antes de chamar de "atrasado". */
const LATE_TOLERANCE_DAYS = 3;

export type FixedCostStatus = 'paid' | 'upcoming' | 'late';

export interface FixedCost {
  key: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  /** Estimativa do valor mensal (mediana dos últimos meses). */
  monthly: number;
  amountKind: 'fixed' | 'variable';
  confidence: 'high' | 'medium';
  /** Dia do mês em que costuma cair. */
  typicalDay: number;
  monthsPresent: number;
  historyMonths: number;
  status: FixedCostStatus;
  /** Valor já pago no mês corrente, quando pago. */
  paidThisMonth: number;
}

export interface FixedCostReport {
  items: FixedCost[];
  /** Meses de histórico com algum lançamento (o que a análise realmente viu). */
  historyMonths: number;
  fixedMonthly: number;
  averageExpense: number;
  averageIncome: number;
  variableMonthly: number;
  /** Quanto precisa entrar por mês para pagar tudo no padrão atual. */
  breakeven: number;
  incomeThisMonth: number;
  expenseThisMonth: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function groupKey(transaction: TransactionWithRelations): string {
  const pattern = derivePattern(transaction.description);
  if (pattern) return pattern;
  return (transaction.description ?? '').trim().toLowerCase() || 'sem descricao';
}

export function analyzeFixedCosts(
  transactions: TransactionWithRelations[],
  reference = new Date(),
): FixedCostReport {
  const thisMonth = currentMonthKey(reference);
  const windowKeys = lastMonthKeys(HISTORY_MONTHS + 1, reference).slice(0, HISTORY_MONTHS);
  const windowSet = new Set(windowKeys);

  // Só conta como histórico o mês que tem algum lançamento: quem conectou o
  // banco há 3 meses não pode ter os outros 3 contados como "não pagou".
  const monthsWithData = new Set<string>();
  let totalIncome = 0;
  let totalExpense = 0;
  let incomeThisMonth = 0;
  let expenseThisMonth = 0;

  const groups = new Map<string, TransactionWithRelations[]>();

  for (const transaction of transactions) {
    const month = monthKeyOf(transaction.transaction_date);
    const inWindow = windowSet.has(month);
    const isCurrent = month === thisMonth;
    if (!inWindow && !isCurrent) continue;

    if (inWindow) {
      monthsWithData.add(month);
      if (transaction.amount >= 0) totalIncome += transaction.amount;
      else totalExpense += Math.abs(transaction.amount);
    } else if (transaction.amount >= 0) {
      incomeThisMonth += transaction.amount;
    } else {
      expenseThisMonth += Math.abs(transaction.amount);
    }

    if (transaction.amount >= 0) continue;
    const key = groupKey(transaction);
    const bucket = groups.get(key) ?? [];
    bucket.push(transaction);
    groups.set(key, bucket);
  }

  const historyMonths = monthsWithData.size;
  const minPresence = Math.max(2, Math.ceil(historyMonths * MIN_PRESENCE_RATIO));
  const today = reference.getDate();
  const items: FixedCost[] = [];

  for (const [key, group] of groups) {
    const perMonth = new Map<string, { total: number; count: number }>();
    const days: number[] = [];
    let paidThisMonth = 0;

    for (const transaction of group) {
      const month = monthKeyOf(transaction.transaction_date);
      const value = Math.abs(transaction.amount);
      if (month === thisMonth) {
        paidThisMonth += value;
        continue;
      }
      const bucket = perMonth.get(month) ?? { total: 0, count: 0 };
      bucket.total += value;
      bucket.count += 1;
      perMonth.set(month, bucket);
      days.push(Number(transaction.transaction_date.slice(8, 10)));
    }

    const monthsPresent = perMonth.size;
    if (historyMonths < 2 || monthsPresent < minPresence) continue;

    const buckets = windowKeys.filter((month) => perMonth.has(month)).map((month) => perMonth.get(month)!);
    const occurrences = buckets.reduce((sum, bucket) => sum + bucket.count, 0) / buckets.length;
    if (occurrences > MAX_OCCURRENCES_PER_MONTH) continue;

    const totals = buckets.map((bucket) => bucket.total);
    const cv = coefficientOfVariation(totals);
    if (cv > MAX_CV) continue;
    if (Math.max(...totals) > Math.min(...totals) * MAX_RANGE_RATIO) continue;

    const typicalDay = Math.round(median(days));
    const dayDeviation = median(days.map((day) => Math.abs(day - typicalDay)));
    if (dayDeviation > MAX_DAY_DEVIATION) continue;
    const status: FixedCostStatus =
      paidThisMonth > 0 ? 'paid' : today > typicalDay + LATE_TOLERANCE_DAYS ? 'late' : 'upcoming';

    items.push({
      key,
      name: key.toUpperCase(),
      category: mostFrequent(group.map((transaction) => transaction.category?.name ?? null)),
      subcategory: mostFrequent(group.map((transaction) => transaction.subcategory?.name ?? null)),
      // Os meses mais recentes pesam mais: reajuste de aluguel ou de plano
      // muda o valor daqui para frente, não o do ano passado.
      monthly: round2(median(totals.slice(-3))),
      amountKind: cv <= FIXED_AMOUNT_CV ? 'fixed' : 'variable',
      confidence: monthsPresent >= 4 && cv <= FIXED_AMOUNT_CV ? 'high' : 'medium',
      typicalDay,
      monthsPresent,
      historyMonths,
      status,
      paidThisMonth: round2(paidThisMonth),
    });
  }

  items.sort((a, b) => b.monthly - a.monthly);

  const fixedMonthly = round2(items.reduce((sum, item) => sum + item.monthly, 0));
  const averageExpense = historyMonths ? round2(totalExpense / historyMonths) : 0;
  const averageIncome = historyMonths ? round2(totalIncome / historyMonths) : 0;
  const variableMonthly = round2(Math.max(0, averageExpense - fixedMonthly));

  return {
    items,
    historyMonths,
    fixedMonthly,
    averageExpense,
    averageIncome,
    variableMonthly,
    breakeven: round2(fixedMonthly + variableMonthly),
    incomeThisMonth: round2(incomeThisMonth),
    expenseThisMonth: round2(expenseThisMonth),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
