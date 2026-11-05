import { parseDateOnly, toDateInputValue } from './format';
import type { TransactionWithRelations } from '@/types';

export type PeriodPreset = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'last-12' | 'this-year' | 'custom';

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this-month', label: 'Este mês' },
  { value: 'last-month', label: 'Mês passado' },
  { value: 'last-3', label: 'Últimos 3 meses' },
  { value: 'last-6', label: 'Últimos 6 meses' },
  { value: 'last-12', label: 'Últimos 12 meses' },
  { value: 'this-year', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
];

/** Intervalo de datas (inclusive) de um período pronto. "Últimos N meses" inclui o atual. */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today = new Date()): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth();
  const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0);
  switch (preset) {
    case 'this-month':
      return { from: toDateInputValue(new Date(year, month, 1)), to: toDateInputValue(endOfMonth(year, month)) };
    case 'last-month':
      return { from: toDateInputValue(new Date(year, month - 1, 1)), to: toDateInputValue(endOfMonth(year, month - 1)) };
    case 'last-3':
    case 'last-6':
    case 'last-12': {
      const count = Number(preset.split('-')[1]);
      return {
        from: toDateInputValue(new Date(year, month - (count - 1), 1)),
        to: toDateInputValue(endOfMonth(year, month)),
      };
    }
    case 'this-year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

export type Granularity = 'day' | 'week' | 'month';

const MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const DAY_LABEL = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** Granularidade que cabe bem no intervalo: dia até ~1 mês, semana até ~3 meses, senão mês. */
export function suggestGranularity(from: string, to: string): Granularity {
  const days = (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000;
  if (days <= 31) return 'day';
  if (days <= 92) return 'week';
  return 'month';
}

/** Segunda-feira da semana da data. */
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const weekday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - weekday);
  return result;
}

function bucketStart(date: Date, granularity: Granularity): Date {
  if (granularity === 'month') return new Date(date.getFullYear(), date.getMonth(), 1);
  if (granularity === 'week') return startOfWeek(date);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextBucket(date: Date, granularity: Granularity): Date {
  if (granularity === 'month') return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const result = new Date(date);
  result.setDate(result.getDate() + (granularity === 'week' ? 7 : 1));
  return result;
}

function bucketLabel(date: Date, granularity: Granularity): string {
  if (granularity === 'month') return MONTH_LABEL.format(date).replace('.', '');
  if (granularity === 'week') return `sem. ${DAY_LABEL.format(date)}`;
  return DAY_LABEL.format(date);
}

export interface PeriodRow {
  key: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  /** Saldo somado desde o início do intervalo. */
  cumulative: number;
  count: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Entradas, saídas e saldo por dia, semana ou mês, incluindo os períodos sem movimento. */
export function groupByPeriod(
  transactions: TransactionWithRelations[],
  granularity: Granularity,
  from: string,
  to: string,
): PeriodRow[] {
  const rows = new Map<string, PeriodRow>();
  const end = parseDateOnly(to);
  for (let cursor = bucketStart(parseDateOnly(from), granularity); cursor <= end; cursor = nextBucket(cursor, granularity)) {
    const key = toDateInputValue(cursor);
    rows.set(key, { key, label: bucketLabel(cursor, granularity), income: 0, expense: 0, balance: 0, cumulative: 0, count: 0 });
  }
  for (const transaction of transactions) {
    const key = toDateInputValue(bucketStart(parseDateOnly(transaction.accounting_date), granularity));
    const row = rows.get(key);
    if (!row) continue;
    if (transaction.amount >= 0) row.income += transaction.amount;
    else row.expense += Math.abs(transaction.amount);
    row.count += 1;
  }
  let running = 0;
  return [...rows.values()].map((row) => {
    const balance = row.income - row.expense;
    running += balance;
    return {
      ...row,
      income: round2(row.income),
      expense: round2(row.expense),
      balance: round2(balance),
      cumulative: round2(running),
    };
  });
}

export interface CategoryRow {
  id: string;
  name: string;
  income: number;
  expense: number;
  /** Receitas − despesas da categoria. */
  net: number;
  count: number;
  children: CategoryRow[];
}

const UNCATEGORIZED = 'Sem categoria';
const NO_SUBCATEGORY = 'Sem subcategoria';

/** Receitas e despesas por categoria e subcategoria, da maior movimentação para a menor. */
export function groupByCategory(transactions: TransactionWithRelations[]): CategoryRow[] {
  const parents = new Map<string, CategoryRow & { childMap: Map<string, CategoryRow> }>();
  const blank = (id: string, name: string): CategoryRow => ({ id, name, income: 0, expense: 0, net: 0, count: 0, children: [] });

  for (const transaction of transactions) {
    const parentId = transaction.category?.id ?? 'none';
    let parent = parents.get(parentId);
    if (!parent) {
      parent = { ...blank(parentId, transaction.category?.name ?? UNCATEGORIZED), childMap: new Map() };
      parents.set(parentId, parent);
    }
    const childId = transaction.subcategory?.id ?? `${parentId}-none`;
    let child = parent.childMap.get(childId);
    if (!child) {
      child = blank(childId, transaction.subcategory?.name ?? NO_SUBCATEGORY);
      parent.childMap.set(childId, child);
    }
    for (const row of [parent, child]) {
      if (transaction.amount >= 0) row.income += transaction.amount;
      else row.expense += Math.abs(transaction.amount);
      row.count += 1;
    }
  }

  const finish = (row: CategoryRow): CategoryRow => ({
    ...row,
    income: round2(row.income),
    expense: round2(row.expense),
    net: round2(row.income - row.expense),
  });
  const volume = (row: CategoryRow) => row.income + row.expense;

  return [...parents.values()]
    .map(({ childMap, ...parent }) => ({
      ...finish(parent),
      // Só vale abrir quando há mais de uma subcategoria ou alguma de fato.
      children: [...childMap.values()]
        .map(finish)
        .sort((a, b) => volume(b) - volume(a))
        .filter((child, _, all) => all.length > 1 || !child.id.endsWith('-none')),
    }))
    .sort((a, b) => volume(b) - volume(a));
}

/** Gera um CSV (separador ";" e vírgula decimal, como o Excel em português espera). */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    const text = typeof value === 'number' ? value.toFixed(2).replace('.', ',') : value;
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM para o Excel reconhecer os acentos.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
