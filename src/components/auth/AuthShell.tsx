import type { ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/common/Logo';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Entrada do app: uma tela só em Verde Profundo, com a marca e os textos à
 * esquerda e o cartão de acesso à direita, sobre o mesmo fundo — sem divisão
 * no meio. O símbolo em escala de cartaz atravessa por trás dos dois lados e
 * costura a composição. No celular os textos encolhem e o cartão vem abaixo.
 */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="relative isolate flex min-h-dvh overflow-hidden bg-deep">
      {/* O símbolo atrás de tudo, cruzando do texto até o cartão */}
      <LogoMark
        tone="negative"
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[46rem] w-[46rem] -translate-x-[38%] -translate-y-1/2 opacity-[0.06] max-lg:hidden"
      />

      <div className="mx-auto grid w-full max-w-6xl content-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16 lg:px-12">
        <section className="flex flex-col lg:justify-center">
          <Logo tone="negative" motion="intro" size="h-10 w-auto lg:h-[53px]" />

          <h2 className="mt-8 max-w-md font-display text-3xl leading-[1.1] font-bold tracking-[-0.03em] text-balance text-mist sm:text-4xl lg:mt-14 lg:text-5xl">
            Cada transação conferida antes de virar número.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-mist-2 max-sm:hidden">
            Suas contas num lugar só, conciliadas uma a uma, e o mês inteiro à vista.
          </p>

          <p className="mt-10 text-xs font-semibold tracking-[0.18em] text-mist-2 uppercase max-lg:hidden lg:mt-16">
            Finanças <span className="text-mint">para nós</span>
          </p>
        </section>

        <main className="w-full rounded-3xl bg-page p-6 shadow-[0_24px_60px_-20px_rgb(8_38_35/0.6)] ring-1 ring-mist/10 sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
