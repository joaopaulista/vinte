const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(value ?? 0);
}

/** Versão curta para eixos de gráfico: R$ 8,5 mil. */
export function formatCurrencyCompact(value: number | null | undefined): string {
  return compactCurrencyFormatter.format(value ?? 0);
}

/**
 * Datas do Postgres chegam como 'YYYY-MM-DD'. Passar direto pro `new Date()`
 * as interpreta como UTC e, em fuso negativo, joga o dia pra trás — por isso
 * quebramos a string manualmente.
 */
export function parseDateOnly(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function formatDate(isoDate: string): string {
  return parseDateOnly(isoDate).toLocaleDateString('pt-BR');
}

export function formatMonthLabel(isoDate: string): string {
  const label = parseDateOnly(isoDate).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  });
  return label.replace('.', '');
}

/** 'YYYY-MM-DD' de uma Date local, sem passar por UTC. */
export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthsAgo(count: number, date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() - count, 1);
}
