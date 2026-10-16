/**
 * Logo do VINTE: o símbolo de "visto" é o próprio V, seguido de "inte".
 *
 * Geometria copiada da arte original (vinte-logo-camadas.svg): duas hastes de
 * traço 15 com pontas redondas. A curta, Menta, fica por baixo; a longa passa
 * por cima. As cores vêm de variáveis CSS para acompanhar o tema, e `tone`
 * força a versão negativa sobre fundos escuros.
 *
 * Animação (Manual, seção 07 — "o gesto de verificar"):
 *   intro  traça a haste Menta, completa o check e faz "inte" deslizar, uma vez;
 *   loop   repete o traçado do símbolo enquanto sincroniza.
 */

import type { CSSProperties } from 'react';

type Tone = 'auto' | 'negative';
type Motion = 'none' | 'intro' | 'loop';

const NEGATIVE = { '--vinte-logo-long': '#f3f5f4', '--vinte-logo-short': '#3ccf9e' } as CSSProperties;

const MOTION_CLASS: Record<Motion, string | undefined> = {
  none: undefined,
  intro: 'logo-intro',
  loop: 'logo-loop',
};

function CheckStrokes() {
  return (
    <g fill="none" strokeLinecap="round" strokeWidth="15">
      <line
        className="check-short"
        x1="20"
        y1="46"
        x2="42"
        y2="76"
        stroke="var(--vinte-logo-short)"
        pathLength={1}
      />
      <line
        className="check-long"
        x1="42"
        y1="76"
        x2="80"
        y2="22"
        stroke="var(--vinte-logo-long)"
        pathLength={1}
      />
    </g>
  );
}

interface LogoMarkProps {
  className?: string;
  tone?: Tone;
  motion?: Motion;
}

/** Só o símbolo — o manual o reserva para a navegação e o ícone do app. */
export function LogoMark({ className = 'h-8 w-8', tone = 'auto', motion = 'none' }: LogoMarkProps) {
  return (
    <svg
      viewBox="12 11 76 76"
      className={[className, MOTION_CLASS[motion]].filter(Boolean).join(' ')}
      style={tone === 'negative' ? NEGATIVE : undefined}
      role="img"
      aria-label="VINTE"
      xmlns="http://www.w3.org/2000/svg"
    >
      <CheckStrokes />
    </svg>
  );
}

interface LogoProps {
  /** 'compact' = assinatura de uma linha. 'stacked' = assinatura grande com slogan. */
  variant?: 'compact' | 'stacked';
  /** Classes de altura do lockup, para fugir dos tamanhos padrão. */
  size?: string;
  tone?: Tone;
  motion?: Motion;
  className?: string;
}

/** Assinatura completa: símbolo + "inte". O manual a usa na tela de entrada. */
export function Logo({
  variant = 'compact',
  tone = 'auto',
  motion = 'none',
  size,
  className = '',
}: LogoProps) {
  const lockup = (
    <svg
      viewBox="12 12 226 74"
      className={[size ?? (variant === 'compact' ? 'h-7 w-auto' : 'h-14 w-auto'), MOTION_CLASS[motion]]
        .filter(Boolean)
        .join(' ')}
      style={tone === 'negative' ? NEGATIVE : undefined}
      role="img"
      aria-label="VINTE"
      xmlns="http://www.w3.org/2000/svg"
    >
      <CheckStrokes />
      <text
        className="logo-word"
        x="90"
        y="53"
        dominantBaseline="middle"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize="83.3"
        letterSpacing="-3.3"
        fill="var(--vinte-logo-long)"
      >
        inte
      </text>
    </svg>
  );

  if (variant === 'compact') {
    return <div className={`flex items-center ${className}`}>{lockup}</div>;
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {lockup}
      <p
        className={`mt-4 text-xs font-semibold tracking-[0.18em] uppercase ${
          tone === 'negative' ? 'text-mist-2' : 'text-ink-2'
        }`}
      >
        Finanças <span className={tone === 'negative' ? 'text-mint' : 'text-success-ink'}>para nós</span>
      </p>
    </div>
  );
}
