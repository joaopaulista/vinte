import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, Loader2, Upload, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAccounts } from '@/services/accountsService';
import { fetchAccountEntries, importStatementLines } from '@/services/transactionsService';
import { classifyLines, parseStatement, readStatementFile } from '@/utils/statementImport';
import type { LineVerdict, StatementLine } from '@/utils/statementImport';
import { formatCurrency, formatDate } from '@/utils/format';
import type { AccountWithConnection } from '@/types';

interface Preview {
  fileName: string;
  lines: StatementLine[];
  verdicts: Map<number, LineVerdict>;
  /** Linhas que não deu para ler (data ou valor inválido). */
  unreadable: number;
}

interface ImportStatementCardProps {
  /** Chamado depois de gravar: a página recarrega a fila e mostra o aviso. */
  onImported: (message: string) => void | Promise<void>;
}

/**
 * Importa um extrato (OFX ou CSV) para a fila de conciliação. Antes de gravar
 * mostra a prévia: o que já existe na conta (mesmo dia e mesmo valor) fica de
 * fora, e só o que é novo entra como pendente.
 */
export function ImportStatementCard({ onImported }: ImportStatementCardProps) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithConnection[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [step, setStep] = useState<'idle' | 'reading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts()
      .then((list) => {
        setAccounts(list);
        if (list.length === 1) setAccountId(list[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);

  const fresh = useMemo(
    () => preview?.lines.filter((line) => preview.verdicts.get(line.index)?.status === 'new') ?? [],
    [preview],
  );
  const duplicates = (preview?.lines.length ?? 0) - fresh.length;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!accountId) {
      setError('Escolha a conta do extrato antes do arquivo.');
      return;
    }
    setStep('reading');
    setError(null);
    try {
      const parsed = parseStatement(await readStatementFile(file), file.name);
      if (parsed.lines.length === 0) {
        throw new Error('Nenhum lançamento encontrado no arquivo. Ele precisa ser OFX ou CSV com Data e Valor.');
      }
      const dates = parsed.lines.map((line) => line.date).sort();
      const existing = await fetchAccountEntries(accountId, dates[0], dates[dates.length - 1]);
      setPreview({
        fileName: file.name,
        lines: [...parsed.lines].sort((a, b) => b.date.localeCompare(a.date)),
        verdicts: classifyLines(parsed.lines, existing),
        unreadable: parsed.skipped,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.');
    } finally {
      setStep('idle');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function confirm() {
    if (!preview || !user) return;
    setStep('saving');
    setError(null);
    try {
      const count = await importStatementLines(user.id, accountId, fresh);
      setPreview(null);
      const ignored = duplicates > 0 ? ` ${duplicates} ${duplicates === 1 ? 'já lançada ficou' : 'já lançadas ficaram'} de fora.` : '';
      await onImported(
        `${count} ${count === 1 ? 'lançamento importado' : 'lançamentos importados'} para a fila.${ignored}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível importar.');
    } finally {
      setStep('idle');
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  return (
    <section className="card flex min-w-0 flex-col p-4 lg:min-h-0" aria-labelledby="import-title">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 id="import-title" className="text-sm font-semibold text-ink">
          Importar extrato
        </h2>
        <FileUp className="h-4 w-4 text-ink-3" aria-hidden />
      </div>

      {accounts === null ? (
        <p className="mt-2 text-sm text-ink-2">Carregando contas…</p>
      ) : accounts.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">
          O extrato entra numa conta. Conecte um banco em{' '}
          <Link to="/contas" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
            Contas
          </Link>{' '}
          primeiro.
        </p>
      ) : preview ? (
        <>
          <p className="mt-1 shrink-0 text-xs text-ink-2">
            <span className="font-medium text-ink">{preview.fileName}</span> · {preview.lines.length}{' '}
            {preview.lines.length === 1 ? 'lançamento' : 'lançamentos'}:{' '}
            <span className="font-medium text-success-ink">{fresh.length} novos</span>
            {duplicates > 0 && (
              <>
                , <span className="font-medium text-warn-ink">{duplicates} já lançados</span>
              </>
            )}
            {preview.unreadable > 0 && `, ${preview.unreadable} ilegíveis`}
          </p>

          <ul className="scroll-y -mx-1 mt-2 max-h-48 divide-y divide-line px-1">
            {preview.lines.map((line) => {
              const verdict = preview.verdicts.get(line.index);
              const duplicate = verdict?.status === 'duplicate';
              return (
                <li key={line.index} className={`flex items-center gap-3 py-1.5 ${duplicate ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm text-ink ${duplicate ? 'line-through' : ''}`} title={line.description}>
                      {line.description}
                    </p>
                    <p className="truncate text-xs text-ink-2">
                      {formatDate(line.date)}
                      {verdict?.status === 'duplicate' &&
                        ` · já lançada${verdict.existingDescription ? `: ${verdict.existingDescription}` : ''}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium num ${line.amount > 0 ? 'text-success-ink' : 'text-ink'}`}
                  >
                    {formatCurrency(line.amount)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void confirm()}
              disabled={step === 'saving' || fresh.length === 0}
            >
              {step === 'saving' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {fresh.length === 0 ? 'Nada novo para importar' : `Importar ${fresh.length}`}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPreview(null)}
              disabled={step === 'saving'}
            >
              <X className="h-4 w-4" aria-hidden />
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="mb-1 block text-xs text-ink-2" htmlFor="import-account">
              Conta do extrato
            </label>
            <select
              id="import-account"
              className="field py-1.5"
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                setError(null);
              }}
            >
              <option value="">Escolha…</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {[account.bank_connection?.institution_name, account.name].filter(Boolean).join(' · ') ||
                    'Conta sem nome'}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-ink-3">
              Lançamento com a mesma data e o mesmo valor de um que já está na conta não é importado.
            </p>
          </div>

          <label
            htmlFor="import-file"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-3 py-3 text-center text-sm transition ${
              dragging ? 'border-accent bg-surface-2' : 'border-line hover:border-ink-3 hover:bg-surface-2'
            } ${accountId ? '' : 'opacity-60'}`}
          >
            {step === 'reading' ? (
              <Loader2 className="h-5 w-5 animate-spin text-ink-3" aria-hidden />
            ) : (
              <Upload className="h-5 w-5 text-ink-3" aria-hidden />
            )}
            <span className="font-medium text-ink">
              {step === 'reading' ? 'Lendo o extrato…' : 'Escolher arquivo'}
            </span>
            <span className="text-xs text-ink-2">OFX ou CSV · ou arraste aqui</span>
            <input
              ref={inputRef}
              id="import-file"
              type="file"
              accept=".ofx,.qfx,.csv,.txt,text/csv"
              className="sr-only"
              disabled={step !== 'idle'}
              onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFile(event.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {error && (
        <p className="mt-2 shrink-0 text-sm text-danger-ink" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
