import { cn } from '@/lib/utils';

/**
 * MONOLOOP mark: two interlocking loops (surplus ↔ demand) joined by a copper link.
 * Pure SVG so it inherits colour and scales crisply.
 */
export function LoopMark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 32 20" className={cn('h-5 w-8', className)} aria-hidden fill="none">
      <rect x="1" y="1" width="18" height="18" rx="9" stroke={inverse ? '#F8F5ED' : '#20252A'} strokeWidth="2" />
      <rect x="13" y="1" width="18" height="18" rx="9" stroke="#C66B3D" strokeWidth="2" />
    </svg>
  );
}

export function Wordmark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LoopMark inverse={inverse} />
      <span className={cn('text-[15px] font-semibold tracking-[0.14em]', inverse ? 'text-cream' : 'text-graphite')}>MEGURI</span>
    </span>
  );
}
