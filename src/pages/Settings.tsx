import { Check, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemePreference } from '@/contexts/ThemeContext';
import { Logo } from '@/components/common/Logo';
import { PageHeader } from '@/components/common/PageHeader';

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Claro', hint: 'Fundo névoa', icon: Sun },
  { value: 'dark', label: 'Escuro', hint: 'Fundo verde profundo', icon: Moon },
  { value: 'system', label: 'Sistema', hint: 'Segue o Windows', icon: Monitor },
];

export default function Settings() {
  const { preference, theme, setPreference } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? '—';

  return (
    <div className="page">
      <PageHeader title="Configurações" description="Aparência e dados da sua conta." />

      <div className="page-grid content-start lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-1">
        <div className="scroll-y flex min-w-0 flex-col gap-4">
          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Tema</h2>
            <p className="mt-1 text-sm text-ink-2">
              Escolha entre claro e escuro, ou deixe o VINTE seguir a configuração do seu sistema.
            </p>

            <div
              className="mt-4 grid gap-3 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Tema da interface"
            >
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
                      selected
                        ? 'border-accent bg-surface-2'
                        : 'border-line hover:border-ink-3 hover:bg-surface-2'
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
              <p className="mt-3 text-xs text-ink-3">
                Seu sistema está em modo {theme === 'dark' ? 'escuro' : 'claro'} agora.
              </p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Conta</h2>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Nome</dt>
                <dd className="truncate font-medium text-ink">{displayName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">E-mail</dt>
                <dd className="truncate font-medium text-ink">{user?.email ?? '—'}</dd>
              </div>
            </dl>

            <button
              type="button"
              className="btn-secondary mt-5"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sair da conta
            </button>
          </section>
        </div>

        <section className="flex flex-col items-center justify-center rounded-2xl bg-deep p-8">
          <Logo variant="stacked" tone="negative" />
          <p className="mt-6 text-xs text-mist-2">Versão 0.1.0</p>
        </section>
      </div>
    </div>
  );
}
