import { splitDescription, stripInstallment } from '@/utils/merchant';

interface DescriptionLabelProps {
  description: string | null;
  /** Parcela da compra no cartão: mostra "6/8" ao lado do nome. */
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  className?: string;
}

/**
 * "Transferência enviada | EDP SAO PAULO DISTRIBUICAO DE ENERGIA S A":
 * o tipo da operação discreto, a contraparte em destaque. O texto original
 * do banco fica no tooltip.
 */
export function DescriptionLabel({
  description,
  installmentNumber,
  totalInstallments,
  className = '',
}: DescriptionLabelProps) {
  const parts = splitDescription(description);
  const installment =
    installmentNumber && totalInstallments && totalInstallments > 1
      ? `${installmentNumber}/${totalInstallments}`
      : null;
  const { kind } = parts;
  // Com o selo "6/8" ao lado, o "PARC 06/08" do banco no nome é repetição.
  const name = (installment && stripInstallment(parts.name)) || parts.name;

  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span className="min-w-0 truncate" title={description ?? undefined}>
        {kind && (
          <>
            <span className="font-normal text-ink-2">{kind}</span>
            <span className="font-normal whitespace-pre text-ink-3">{' | '}</span>
          </>
        )}
        <span className="font-semibold text-ink">{name}</span>
      </span>
      {installment && (
        <span
          className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2 tabular-nums"
          title={`Parcela ${installmentNumber} de ${totalInstallments}`}
        >
          {installment}
        </span>
      )}
    </span>
  );
}
