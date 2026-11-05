import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { updateCardDays } from '@/services/accountsService';
import type { AccountWithConnection } from '@/types';

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/**
 * Fechamento e vencimento da fatura do cartão. Com o fechamento definido, a
 * compra feita depois dele passa a contar no mês seguinte (o da próxima
 * fatura) em todos os painéis e relatórios.
 */
export function CardDaysDialog({
  account,
  onClose,
  onSaved,
}: {
  account: AccountWithConnection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [closingDay, setClosingDay] = useState(account.closing_day ? String(account.closing_day) : '');
  const [dueDay, setDueDay] = useState(account.due_day ? String(account.due_day) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateCardDays(account.id, {
        closingDay: closingDay ? Number(closingDay) : null,
        dueDay: dueDay ? Number(dueDay) : null,
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  const select = (id: string, label: string, value: string, onChange: (value: string) => void) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="field" value={value} onChange={(event) => onChange(event.target.value)} disabled={busy}>
        <option value="">Não definido</option>
        {DAYS.map((day) => (
          <option key={day} value={day}>
            Dia {day}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Dialog
      title={
        <>
          <CalendarDays className="h-4 w-4" aria-hidden />
          Fatura · {account.name ?? 'Cartão'}
        </>
      }
      onClose={onClose}
      busy={busy}
    >
      <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
        <p className="text-sm text-ink-2">
          As compras contam até o dia do fechamento. Ex.: com fechamento no dia 25, a compra de 28/10 entra na fatura
          seguinte e conta em novembro.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {select('card-closing', 'Fechamento', closingDay, setClosingDay)}
          {select('card-due', 'Vencimento', dueDay, setDueDay)}
        </div>
        <p className="text-xs text-ink-3">Em mês mais curto que o dia escolhido, vale o último dia do mês.</p>

        {error && (
          <p className="text-sm text-danger-ink" role="alert">
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Salvar
          </button>
        </div>
      </form>
    </Dialog>
  );
}
