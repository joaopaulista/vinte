/**
 * Ciclo da fatura do cartão a partir do dia do fechamento e do vencimento.
 * Em mês mais curto que o dia escolhido, vale o último dia do mês (igual à
 * regra da migration 0014).
 */
function dayIn(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

export interface CardCycle {
  /** Próximo fechamento (hoje conta: fecha hoje). */
  closing: Date;
  /** Vencimento da fatura que fecha em `closing`. */
  due: Date | null;
}

export function nextCardCycle(closingDay: number, dueDay: number | null, today = new Date()): CardCycle {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let closing = dayIn(start.getFullYear(), start.getMonth(), closingDay);
  if (closing < start) closing = dayIn(start.getFullYear(), start.getMonth() + 1, closingDay);
  if (dueDay === null) return { closing, due: null };
  // O vencimento é o primeiro dia `dueDay` depois do fechamento.
  let due = dayIn(closing.getFullYear(), closing.getMonth(), dueDay);
  if (due <= closing) due = dayIn(closing.getFullYear(), closing.getMonth() + 1, dueDay);
  return { closing, due };
}
