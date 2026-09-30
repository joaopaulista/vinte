/**
 * Logo do VINTE, redesenhado em SVG a partir da arte original.
 *
 * Vetor em vez do JPEG por três motivos: escala sem serrilhar em qualquer
 * tamanho, o fundo é transparente (o arquivo original vem com o fundo chapado
 * embutido) e as cores acompanham o tema pelas variáveis CSS.
 */

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="VINTE"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Traço esquerdo do V */}
      <path
        d="M15.5 16 L29.5 49"
        stroke="var(--vinte-logo-primary)"
        strokeWidth="11"
        strokeLinecap="round"
      />
      {/* Traço direito do V, um pouco mais alto e mais aberto */}
      <path
        d="M52.5 13 L35 49"
        stroke="var(--vinte-logo-gold)"
        strokeWidth="11.5"
        strokeLinecap="round"
      />
      {/* A "cabeça": o círculo entre os braços que faz o V virar uma figura humana */}
      <circle cx="33" cy="13.5" r="6.5" fill="var(--vinte-logo-green)" />
    </svg>
  );
}

interface LogoProps {
  /** 'compact' = marca + nome lado a lado (menu). 'stacked' = lockup completo. */
  variant?: 'compact' | 'stacked';
  className?: string;
}

export function Logo({ variant = 'compact', className = '' }: LogoProps) {
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <LogoMark className="h-8 w-8 shrink-0" />
        <span className="font-serif text-2xl leading-none tracking-tight text-ink">vinte</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <LogoMark className="h-14 w-14" />
      <span className="mt-2 font-serif text-4xl leading-none tracking-tight text-ink">
        vinte
      </span>
      <span className="mt-3 block h-px w-8 bg-gold" aria-hidden />
      <p className="mt-2.5 text-[10px] font-medium tracking-[0.2em] text-ink-2 uppercase">
        Finanças <span className="text-success-ink">para nós</span>
      </p>
    </div>
  );
}
