import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, PenLine, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { CategoryPicker } from '@/components/categories/CategoryPicker';
import { useAuth } from '@/contexts/AuthContext';
import { createManualEntry, deleteManualEntry, updateManualEntry } from '@/services/transactionsService';
import { parseMoney, toDateInputValue, toMoneyInput } from '@/utils/format';
import type { AccountWithConnection, CategoryTree, TransactionWithRelations } from '@/types';

interface ManualEntryDialogProps {
  /** Só as contas manuais: nas do Open Finance os lançamentos vêm do banco. */
  accounts: AccountWithConnection[];
  tree: CategoryTree[];
  /** Sem transação, cria um lançamento novo. */
  transaction?: TransactionWithRelations | null;
  /** Conta já escolhida ao abrir (ex.: vindo do card da conta). */
  defaultAccountId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

type Direction = 'expense' | 'income';

/** Lançar (ou corrigir) uma entrada ou saída numa conta manual. */
export function ManualEntryDialog({
  accounts,
  tree,
  transaction,
  defaultAccountId,
  onClose,
  onSaved,
}: ManualEntryDialogProps) {
  const { user } = useAuth();
  const editing = Boolean(transaction);
  const [accountId, setAccountId] = useState(
    transaction?.account_id ?? defaultAccountId ?? accounts[0]?.id ?? '',
  );
  const [direction, setDirection] = useState<Direction>(
    transaction && transaction.amount > 0 ? 'income' : 'expense',
  );
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [amount, setAmount] = useState(transaction ? toMoneyInput(Math.abs(transaction.amount)) : '');
  const [date, setDate] = useState(transaction?.transaction_date ?? toDateInputValue(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id ?? null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(transaction?.subcategory_id ?? null);
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o lançamento.');
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const value = parseMoney(amount);
    if (!accountId) return setError('Escolha a conta.');
    if (!description.trim()) return setError('Descreva o lançamento.');
    if (value === null || value === 0) return setError('Informe um valor diferente de zero.');
    if (!date) return setError('Informe a data.');
    const input = {
      accountId,
      description: description.trim(),
      amount: direction === 'expense' ? -Math.abs(value) : Math.abs(value),
      date,
      categoryId,
      subcategoryId,
      notes: notes.trim() || null,
    };
    void run(() =>
      transaction ? updateManualEntry(transaction.id, input) : createManualEntry(user.id, input),
    );
  }

  const title = (
    <>
      <PenLine className="h-4 w-4" aria-hidden />
      {editing ? 'Editar lançamento' : 'Novo lançamento manual'}
    </>
  );

  if (accounts.length === 0) {
    return (
      <Dialog title={title} onClose={onClose}>
        <p className="text-sm text-ink-2">
          Lançamentos manuais são feitos em contas manuais (dinheiro, cofrinho, conta sem Open Finance). Nas contas
          conectadas, as transações vêm do banco.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <Link to="/contas" className="btn-primary">
            Criar conta manual
          </Link>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Tipo">
          {(
            [
              ['expense', 'Saída'],
              ['income', 'Entrada'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              onClick={() => setDirection(value)}
              disabled={busy}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                direction === value
                  ? value === 'income'
                    ? 'bg-surface text-success-ink shadow-sm'
                    : 'bg-surface text-ink shadow-sm'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="entry-account">
              Conta
            </label>
            <select
              id="entry-account"
              className="field"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={busy}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name ?? 'Conta manual'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="entry-date">
              Data
            </label>
            <input
              id="entry-date"
              type="date"
              className="field"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <div>
            <label className="label" htmlFor="entry-description">
              Descrição
            </label>
            <input
              id="entry-description"
              className="field"
              placeholder={direction === 'expense' ? 'Ex.: Feira' : 'Ex.: Venda do sofá'}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={busy}
              maxLength={140}
            />
          </div>
          <div>
            <label className="label" htmlFor="entry-amount">
              Valor (R$)
            </label>
            <input
              id="entry-amount"
              className="field num"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <CategoryPicker
          tree={tree}
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          disabled={busy}
          idPrefix="entry"
          onChange={(nextCategory, nextSubcategory) => {
            setCategoryId(nextCategory);
            setSubcategoryId(nextSubcategory);
          }}
        />

        <div>
          <label className="label" htmlFor="entry-notes">
            Observação <span className="font-normal text-ink-3">(opcional)</span>
          </label>
          <input
            id="entry-notes"
            className="field"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={busy}
            maxLength={280}
          />
        </div>

        {error && (
          <p className="text-sm text-danger-ink" role="alert">
            {error}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          {transaction &&
            (confirmDelete ? (
              <button
                type="button"
                className="btn-danger"
                disabled={busy}
                onClick={() => void run(() => deleteManualEntry(transaction.id))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Apagar mesmo
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary text-danger-ink"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Apagar
              </button>
            ))}
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {editing ? 'Salvar' : 'Lançar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
