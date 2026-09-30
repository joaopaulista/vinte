import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePendingCount } from '@/contexts/PendingCountContext';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  showPendingBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/conciliacao', label: 'Conciliação', icon: CheckCircle2, showPendingBadge: true },
  { to: '/transacoes', label: 'Transações', icon: ListOrdered },
  { to: '/contas', label: 'Contas', icon: Wallet },
  { to: '/configuracoes', label: 'Configurações', icon: SettingsIcon },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { pendingCount } = usePendingCount();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Usuário';

  return (
    <div className="min-h-screen lg:flex">
      {/* Barra superior (mobile) */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <aside
        className={`${menuOpen ? 'block' : 'hidden'} border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0`}
      >
        <div className="hidden items-center justify-between px-5 py-6 lg:flex">
          <Logo />
          <ThemeToggle />
        </div>

        <nav className="flex flex-col gap-1 px-3 py-3 lg:py-0">
          {NAV_ITEMS.map(({ to, label, icon: Icon, showPendingBadge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-surface-2 text-accent'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {showPendingBadge && pendingCount > 0 && (
                <span className="rounded-full bg-warn-surface px-2 py-0.5 text-xs font-semibold text-warn-ink">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-line px-3 py-4">
          <p className="truncate px-3 pb-2 text-xs text-ink-3" title={displayName}>
            {displayName}
          </p>
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

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

/** Atalho de um clique. A escolha completa (incluindo "seguir o sistema") fica em Configurações. */
function ThemeToggle() {
  const { theme, setPreference } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setPreference(nextTheme)}
      className="rounded-lg p-2 text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      aria-label={`Mudar para o tema ${nextTheme === 'dark' ? 'escuro' : 'claro'}`}
      title={`Mudar para o tema ${nextTheme === 'dark' ? 'escuro' : 'claro'}`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
