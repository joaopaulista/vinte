import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Trash2, Wallet } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  MANUAL_ACCOUNT_TYPES,
  createManualAccount,
  deleteManualAccount,
  updateManualAccount,
} from '@/services/accountsService';
import { parseMoney, toMoneyInput } from '@/utils/format';
import type { AccountWithConnection } from '@/types';

interface ManualAccountDialogProps {
  /** Sem conta, cria uma nova. */
  account?: AccountWithConnection | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Cadastro de conta manual: dinheiro na carteira, cofrinho, conta de um banco
 * sem Open Finance. O saldo informado é o de hoje; depois ele anda sozinho
 * com os lançamentos manuais da conta.
 */
export function ManualAccountDialog({ account, onClose, onSaved }: ManualAccountDialogProps) {
  const { user } = useAuth();
  const editing = Boolean(account);
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? 'CASH');
  const [balance, setBalance] = useState(account ? toMoneyInput(account.balance ?? 0) : '');
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
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a conta.');
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Dê um nome para a conta.');
      return;
    }
    const value = balance.trim() === '' ? 0 : parseMoney(balance);
    if (value === null) {
      setError('Saldo inválido. Use, por exemplo, 250,00.');
      return;
    }
    const input = { name: trimmed, type, balance: value };
    void run(() => (account ? updateManualAccount(account, input) : createManualAccount(user.id, input)));
  }

  return (
    <Dialog
      title={
        <>
          <Wallet className="h-4 w-4" aria-hidden />
          {editing ? 'Editar conta manual' : 'Nova conta manual'}
        </>
      }
      onClose={onClose}
      busy={busy}
    >
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <p className="text-sm text-ink-2">
          Para dinheiro em espécie ou contas sem Open Finance. Os lançamentos dela você registra à mão em Transações.
        </p>
        <div>
          <label className="label" htmlFor="manual-account-name">
            Nome
          </label>
          <input
            id="manual-account-name"
            className="field"
            placeholder="Ex.: Carteira, Cofrinho"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            maxLength={60}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="manual-account-type">
              Tipo
            </label>
            <select
              id="manual-account-type"
              className="field"
              value={type}
              onChange={(event) => setType(event.target.value)}
              disabled={busy}
            >
              {MANUAL_ACCOUNT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="manual-account-balance">
              Saldo atual (R$)
            </label>
            <input
              id="manual-account-balance"
              className="field num"
              inputMode="decimal"
              placeholder="0,00"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {confirmDelete && (
          <div className="rounded-lg bg-danger-surface p-3 text-sm text-danger-ink">
            Apagar “{account?.name}” remove também todos os lançamentos dela. Não dá para desfazer.
          </div>
        )}

        {error && (
          <p className="text-sm text-danger-ink" role="alert">
            {error}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          {account &&
            (confirmDelete ? (
              <button
                type="button"
                className="btn-danger"
                disabled={busy}
                onClick={() => void run(() => deleteManualAccount(account.id))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Apagar mesmo
              </button>
            ) : (
              <button type="button" className="btn-secondary text-danger-ink" disabled={busy} onClick={() => setConfirmDelete(true)}>
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
            {editing ? 'Salvar' : 'Criar conta'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
