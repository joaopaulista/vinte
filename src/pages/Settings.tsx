import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Check, Loader2, LogOut, Monitor, Moon, Palette, Sun, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemePreference } from '@/contexts/ThemeContext';
import { Logo } from '@/components/common/Logo';
import { PageHeader } from '@/components/common/PageHeader';
import { supabase } from '@/services/supabaseClient';
import { APP_VERSION } from '@/version';

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Claro', hint: 'Fundo névoa', icon: Sun },
  { value: 'dark', label: 'Escuro', hint: 'Fundo verde profundo', icon: Moon },
  { value: 'system', label: 'Sistema', hint: 'Segue o Windows', icon: Monitor },
];

const MIN_PASSWORD = 8;

type Feedback = { tone: 'success' | 'error'; message: string } | null;

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="page">
      <PageHeader title="Configurações" description="Aparência, dados da sua conta e versão do sistema." />

      <div className="page-grid content-start lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-1">
        <div className="scroll-y -m-1 flex min-w-0 flex-col gap-4 p-1">
          <Section icon={Palette} title="Tema" description="Claro, escuro ou seguindo a configuração do sistema.">
            <ThemeChooser />
          </Section>

          <Section icon={UserRound} title="Minha conta" description="Como você aparece no VINTE, com qual e-mail entra e a sua senha.">
            <ProfileForm key={user?.id} />
            <PasswordRow />
          </Section>

          <div className="shrink-0">
            <button type="button" className="btn-secondary" onClick={() => void handleSignOut()}>
              <LogOut className="h-4 w-4" aria-hidden />
              Sair da conta
            </button>
          </div>
        </div>

        <section className="flex flex-col items-center justify-center rounded-2xl bg-deep p-8" aria-label="Sobre o VINTE">
          <Logo variant="stacked" tone="negative" />
          <dl className="mt-6 text-center">
            <dt className="text-xs text-mist-2">Versão atual</dt>
            <dd className="num mt-0.5 text-sm font-semibold text-mist">{APP_VERSION}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

/** Bloco de configuração: título e explicação à esquerda, campos à direita. */
function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card grid shrink-0 gap-4 p-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Icon className="h-4 w-4 text-ink-3" aria-hidden />
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-2">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ThemeChooser() {
  const { preference, theme, setPreference } = useTheme();

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tema da interface">
        {THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(value)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                selected ? 'border-accent bg-surface-2' : 'border-line hover:border-ink-3 hover:bg-surface-2'
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  selected ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-xs text-ink-3">{hint}</span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
            </button>
          );
        })}
      </div>

      {preference === 'system' && (
        <p className="mt-3 text-xs text-ink-3">Seu sistema está em modo {theme === 'dark' ? 'escuro' : 'claro'} agora.</p>
      )}
    </>
  );
}

function ProfileForm() {
  const { user } = useAuth();
  const savedName = (user?.user_metadata?.full_name as string | undefined) ?? '';
  const [name, setName] = useState(savedName);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) {
      setFeedback({ tone: 'error', message: 'Informe seu nome.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: next } });
    setSaving(false);
    setFeedback(error ? { tone: 'error', message: error.message } : { tone: 'success', message: 'Nome atualizado.' });
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
      <Field label="Nome" htmlFor="profile-name">
        <input
          id="profile-name"
          className="field"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
        />
      </Field>
      <Field label="E-mail" htmlFor="profile-email" hint="O e-mail é o seu login e não pode ser trocado aqui.">
        <input id="profile-email" className="field" type="email" value={user?.email ?? ''} readOnly disabled />
      </Field>
      <FormFooter
        saving={saving}
        disabled={name.trim() === savedName}
        label="Salvar nome"
        feedback={feedback}
      />
    </form>
  );
}

/**
 * Senha recolhida numa linha só; o formulário abre ao clicar em "Redefinir"
 * e fecha sozinho depois de trocar.
 */
function PasswordRow() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink-2">Senha</p>
          <p className="text-sm text-ink" aria-label="Senha oculta">
            ••••••••
            {done && <span className="ml-2 text-xs text-success-ink">Senha alterada.</span>}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            className="text-sm font-medium text-ink underline underline-offset-4 hover:text-accent"
            onClick={() => {
              setOpen(true);
              setDone(false);
            }}
            aria-expanded={open}
            aria-controls="password-form"
          >
            Redefinir senha
          </button>
        )}
      </div>
      {open && (
        <div id="password-form" className="animate-enter mt-3">
          <PasswordForm
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              setDone(true);
            }}
          />
        </div>
      )}
    </div>
  );
}

function PasswordForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (next.length < MIN_PASSWORD) {
      setFeedback({ tone: 'error', message: `A nova senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` });
      return;
    }
    if (next !== confirm) {
      setFeedback({ tone: 'error', message: 'A confirmação não bate com a nova senha.' });
      return;
    }
    if (next === current) {
      setFeedback({ tone: 'error', message: 'A nova senha precisa ser diferente da atual.' });
      return;
    }
    if (!user?.email) return;

    setSaving(true);
    setFeedback(null);
    try {
      // O Supabase troca a senha só com a sessão; conferir a atual antes evita
      // que alguém com o computador aberto troque a senha de outra pessoa.
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (check.error) throw new Error('A senha atual está incorreta.');
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      onDone();
    } catch (cause) {
      setFeedback({ tone: 'error', message: cause instanceof Error ? cause.message : 'Não foi possível trocar a senha.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
      {/* Ajuda gerenciadores de senha a saber de qual conta é a senha nova. */}
      <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
      <Field label="Senha atual" htmlFor="password-current">
        <input
          id="password-current"
          className="field"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          disabled={saving}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nova senha" htmlFor="password-new">
          <input
            id="password-new"
            className="field"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="Confirmar nova senha" htmlFor="password-confirm">
          <input
            id="password-confirm"
            className="field"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={saving}
          />
        </Field>
      </div>
      <FormFooter
        saving={saving}
        disabled={!current || !next || !confirm}
        label="Alterar senha"
        feedback={feedback}
        onCancel={onCancel}
      />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium text-ink-2" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function FormFooter({
  saving,
  disabled,
  label,
  feedback,
  onCancel,
}: {
  saving: boolean;
  disabled: boolean;
  label: string;
  feedback: Feedback;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn-primary" disabled={saving || disabled}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {label}
      </button>
      {onCancel && (
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      )}
      {feedback && (
        <p
          className={`text-sm ${feedback.tone === 'success' ? 'text-success-ink' : 'text-danger-ink'}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
