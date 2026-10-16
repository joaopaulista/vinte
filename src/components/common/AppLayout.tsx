import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  Home,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Settings as SettingsIcon,
  Sun,
  Tags,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { syncTransactions } from '@/services/pluggyService';
import type { SyncResult } from '@/types';
import { Logo, LogoMark } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  showPendingBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/analises', label: 'Análises', icon: BarChart3 },
  { to: '/conciliacao', label: 'Conciliação', icon: CheckCircle2, showPendingBadge: true },
  { to: '/transacoes', label: 'Transações', icon: ListOrdered },
  { to: '/contas', label: 'Contas', icon: Wallet },
  { to: '/categorias', label: 'Categorias', icon: Tags },
  { to: '/configuracoes', label: 'Configurações', icon: SettingsIcon },
];

/**
 * Casca do app: conteúdo à esquerda e menu à direita.
 *
 * No desktop o menu fica recolhido numa coluna de ícones e só abre (por cima
 * do conteúdo, sem empurrar a página) pelo botão de expandir. No celular a
 * coluna some e o mesmo painel abre pelo botão da barra superior.
 *
 * O símbolo animado fica no canto superior (o manual reserva o símbolo isolado
 * para a navegação) e é também o botão de sincronizar.
 */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const { pendingCount, refreshPendingCount } = usePendingCount();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; error: boolean } | null>(null);
  // Muda a cada sincronização: remonta a página aberta para ela buscar os dados de novo.
  const [syncVersion, setSyncVersion] = useState(0);

  useEffect(() => {
    if (!syncMessage) return;
    const timer = window.setTimeout(() => setSyncMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [syncMessage]);

  // Trocar de página fecha o menu.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Aberto: foco no botão de fechar e Esc fecha. Fechado: o foco volta para
  // quem abriu, para quem navega pelo teclado não se perder.
  useEffect(() => {
    if (!menuOpen) {
      openerRef.current?.focus();
      return;
    }
    closeButtonRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function openMenu(event: MouseEvent<HTMLElement>) {
    openerRef.current = event.currentTarget;
    setMenuOpen(true);
  }

  /** Atualiza todas as contas conectadas. Fica no logo, presente em todas as telas. */
  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncTransactions();
      await refreshPendingCount();
      setSyncVersion((version) => version + 1);
      setSyncMessage({ text: describeSync(result), error: false });
    } catch (cause) {
      setSyncMessage({
        text: cause instanceof Error ? cause.message : 'Falha ao sincronizar',
        error: true,
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Usuário';
  // Ao entrar, o símbolo faz o gesto de verificar uma vez; sincronizando, repete.
  const markMotion = syncing ? 'loop' : 'intro';

  return (
    <div className="min-h-dvh lg:flex lg:h-dvh lg:overflow-hidden">
      {/* Barra superior (celular) */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <SyncButton syncing={syncing} onSync={() => void handleSync()} className="-m-1 p-1">
          <LogoMark motion={markMotion} className="h-8 w-8" />
        </SyncButton>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
            onClick={openMenu}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            aria-controls="menu-principal"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:h-dvh lg:overflow-y-auto lg:px-8 lg:py-6">
        {/* A chave pela rota faz a página nova entrar com a animação de entrada. */}
        <div key={`${location.pathname}#${syncVersion}`} className="animate-enter lg:h-full">
          <Outlet />
        </div>
      </main>

      {/* Coluna recolhida (desktop): só ícones. */}
      <aside
        className="hidden w-16 shrink-0 flex-col items-center gap-1 border-l border-line bg-surface py-4 lg:flex"
        aria-label="Menu"
      >
        <SyncButton syncing={syncing} onSync={() => void handleSync()} className="grid h-10 w-10 place-items-center">
          <LogoMark motion={markMotion} className="h-7 w-7" />
        </SyncButton>

        <button
          type="button"
          onClick={openMenu}
          className="mt-1 grid h-10 w-10 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          aria-label="Expandir menu"
          aria-expanded={menuOpen}
          aria-controls="menu-principal"
          title="Expandir menu"
        >
          <PanelRightOpen className="h-5 w-5" aria-hidden />
        </button>

        <span className="my-2 h-px w-8 bg-line" aria-hidden />

        <nav className="flex flex-col items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, showPendingBadge }) => {
            const badge = showPendingBadge && pendingCount > 0 ? pendingCount : null;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={badge ? `${label} (${badge} pendentes)` : label}
                aria-label={badge ? `${label}, ${badge} pendentes` : label}
                className={({ isActive }) =>
                  `relative grid h-10 w-10 place-items-center rounded-lg transition ${
                    isActive ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`
                }
              >
                <Icon className="h-5 w-5" aria-hidden />
                {badge && (
                  <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="grid h-10 w-10 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </aside>

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4 sm:top-auto sm:bottom-4"
      >
        {syncing ? (
          <div className="animate-toast flex max-w-md items-center gap-2.5 rounded-xl bg-[#082623] px-4 py-2 text-sm text-[#f3f5f4] shadow-lg">
            <LogoMark tone="negative" motion="loop" className="h-5 w-5" />
            Sincronizando contas…
          </div>
        ) : (
          syncMessage && (
            <div
              className={`animate-toast max-w-md rounded-xl px-4 py-2 text-sm shadow-lg ${
                syncMessage.error ? 'bg-coral text-[#082623]' : 'bg-[#082623] text-[#f3f5f4]'
              }`}
            >
              {syncMessage.text}
            </div>
          )
        )}
      </div>

      {/* Menu expandido: suspenso por cima do conteúdo, na direita. */}
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="animate-fade absolute inset-0 bg-[#082623]/50"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <aside
            id="menu-principal"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="animate-drawer absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <Logo motion="intro" />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
                aria-label="Recolher menu"
                title="Recolher menu"
              >
                <PanelRightClose className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <nav className="flex flex-col gap-1 px-3">
              {NAV_ITEMS.map(({ to, label, icon: Icon, showPendingBadge }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-accent text-accent-ink'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="flex-1">{label}</span>
                  {showPendingBadge && pendingCount > 0 && (
                    <span className="rounded-full bg-coral px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto border-t border-line px-3 py-4">
              <div className="flex items-center justify-between gap-2 px-3 pb-2">
                <p className="truncate text-xs text-ink-3" title={displayName}>
                  {displayName}
                </p>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

interface SyncButtonProps {
  syncing: boolean;
  onSync: () => void;
  className?: string;
  children: ReactNode;
}

/** O logo também é o botão de sincronizar: o símbolo se retraça enquanto busca as transações novas. */
function SyncButton({ syncing, onSync, className = '', children }: SyncButtonProps) {
  return (
    <button
      type="button"
      onClick={onSync}
      disabled={syncing}
      className={`rounded-lg transition hover:bg-surface-2 disabled:cursor-progress ${className}`}
      aria-label={syncing ? 'Sincronizando contas' : 'Sincronizar contas'}
      title={syncing ? 'Sincronizando…' : 'Sincronizar contas'}
    >
      {children}
    </button>
  );
}

function describeSync(result: SyncResult): string {
  if (result.transactionsInserted === 0) return 'Sincronizado: nenhuma transação nova.';
  const plural = result.transactionsInserted === 1 ? 'nova transação' : 'novas transações';
  return `Sincronizado: ${result.transactionsInserted} ${plural} aguardando conciliação.`;
}

/** Atalho de um clique. A escolha completa (incluindo "seguir o sistema") fica em Configurações. */
function ThemeToggle() {
  const { theme, setPreference } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setPreference(nextTheme)}
      className="grid h-10 w-10 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      aria-label={`Mudar para o tema ${nextTheme === 'dark' ? 'escuro' : 'claro'}`}
      title={`Mudar para o tema ${nextTheme === 'dark' ? 'escuro' : 'claro'}`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
