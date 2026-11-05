import type { AccountOwner } from '@/types';

/** Bolinha com a cor do responsável, ao lado do nome. */
export function OwnerDot({ owner, className = '' }: { owner: Pick<AccountOwner, 'color'> | null; className?: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${owner ? '' : 'border border-dashed border-ink-3'} ${className}`}
      style={owner ? { backgroundColor: owner.color ?? 'var(--vinte-ink-3)' } : undefined}
      aria-hidden
    />
  );
}
