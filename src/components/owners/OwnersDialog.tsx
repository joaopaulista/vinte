import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { useAuth } from '@/contexts/AuthContext';
import { OWNER_COLORS, createOwner, deleteOwner, renameOwner } from '@/services/ownersService';
import { OwnerDot } from './OwnerDot';
import type { AccountOwner } from '@/types';

interface OwnersDialogProps {
  owners: AccountOwner[];
  /** Quantas contas cada responsável tem, para avisar antes de excluir. */
  accountCount: (ownerId: string) => number;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

/** Cadastro dos responsáveis: quem cuida de cada conta (ex.: cada pessoa do casal). */
export function OwnersDialog({ owners, accountCount, onClose, onChanged }: OwnersDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !user) return;
    const color = OWNER_COLORS[owners.length % OWNER_COLORS.length];
    if (await run(() => createOwner(user.id, trimmed, color))) setName('');
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editing.name.trim()) return;
    const target = editing;
    if (await run(() => renameOwner(target.id, target.name.trim()))) setEditing(null);
  }

  function handleDelete(owner: AccountOwner) {
    const count = accountCount(owner.id);
    const message =
      count > 0
        ? `${owner.name} é responsável por ${count} ${count === 1 ? 'conta' : 'contas'}. Elas ficam sem responsável. Excluir?`
        : `Excluir ${owner.name}?`;
    if (window.confirm(message)) void run(() => deleteOwner(owner.id));
  }

  return (
    <Dialog
      title={
        <>
          <Users className="h-4 w-4" aria-hidden />
          Responsáveis
        </>
      }
      onClose={onClose}
      busy={busy}
    >
      <p className="text-sm text-ink-2">
        Quem cuida de cada conta. Útil quando duas pessoas usam o mesmo VINTE: a Home e os Relatórios podem mostrar só
        as contas de um responsável.
      </p>

      <form className="mt-4 flex gap-2" onSubmit={(event) => void handleCreate(event)}>
        <label className="sr-only" htmlFor="new-owner-name">
          Nome do responsável
        </label>
        <input
          id="new-owner-name"
          className="field"
          placeholder="Nome (ex.: Ana)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          maxLength={60}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Adicionar
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm text-danger-ink" role="alert">
          {error}
        </p>
      )}

      {owners.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-center text-sm text-ink-3">
          Nenhum responsável cadastrado.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {owners.map((owner) => (
            <li key={owner.id} className="flex items-center gap-3 px-3 py-2">
              <OwnerDot owner={owner} />
              {editing?.id === owner.id ? (
                <form className="flex flex-1 items-center gap-1.5" onSubmit={(event) => void handleRename(event)}>
                  <label className="sr-only" htmlFor={`owner-${owner.id}`}>
                    Novo nome
                  </label>
                  <input
                    id={`owner-${owner.id}`}
                    className="field py-1"
                    value={editing.name}
                    autoFocus
                    onChange={(event) => setEditing({ id: owner.id, name: event.target.value })}
                    disabled={busy}
                    maxLength={60}
                  />
                  <IconButton label="Salvar nome" type="submit" disabled={busy}>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </IconButton>
                  <IconButton label="Cancelar" onClick={() => setEditing(null)} disabled={busy}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </IconButton>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{owner.name}</span>
                  <span className="text-xs text-ink-3">
                    {accountCount(owner.id)} {accountCount(owner.id) === 1 ? 'conta' : 'contas'}
                  </span>
                  <IconButton label={`Renomear ${owner.name}`} onClick={() => setEditing({ id: owner.id, name: owner.name })} disabled={busy}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </IconButton>
                  <IconButton label={`Excluir ${owner.name}`} onClick={() => handleDelete(owner)} disabled={busy} danger>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex justify-end">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
          Fechar
        </button>
      </div>
    </Dialog>
  );
}

function IconButton({
  label,
  children,
  danger = false,
  type = 'button',
  ...props
}: {
  label: string;
  children: ReactNode;
  danger?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition hover:bg-surface-2 disabled:opacity-50 ${
        danger ? 'text-danger-ink' : 'text-ink-3 hover:text-ink'
      }`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
