import type { ReactNode } from 'react';
import { Logo } from '@/components/common/Logo';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo variant="stacked" className="mb-8" />

        <div className="mb-5 text-center">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        </div>

        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}
