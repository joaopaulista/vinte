import { splitDescription } from '@/utils/merchant';

interface DescriptionLabelProps {
  description: string | null;
  className?: string;
}

/**
 * "Transferência enviada | EDP SAO PAULO DISTRIBUICAO DE ENERGIA S A":
 * o tipo da operação discreto, a contraparte em destaque. O texto original
 * do banco fica no tooltip.
 */
export function DescriptionLabel({ description, className = '' }: DescriptionLabelProps) {
  const { kind, name } = splitDescription(description);

  return (
    <span className={`block truncate ${className}`} title={description ?? undefined}>
      {kind && (
        <>
          <span className="font-normal text-ink-2">{kind}</span>
          <span className="font-normal whitespace-pre text-ink-3">{' | '}</span>
        </>
      )}
      <span className="font-semibold text-ink">{name}</span>
    </span>
  );
}
