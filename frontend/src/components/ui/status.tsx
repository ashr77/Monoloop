import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'copper' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONES: Record<Tone, { text: string; dot: string }> = {
  neutral: { text: 'text-graphite', dot: 'bg-graphite' },
  copper: { text: 'text-copper-700', dot: 'bg-copper' },
  success: { text: 'text-moss-700', dot: 'bg-moss-600' },
  warning: { text: 'text-ochre-700', dot: 'bg-ochre-500' },
  danger: { text: 'text-brick-700', dot: 'bg-brick-600' },
  info: { text: 'text-slate-800', dot: 'bg-slate-500' },
  muted: { text: 'text-slate-600', dot: 'bg-slate-400' },
};

/**
 * Status label: a coloured dot + text. Colour is never the only signal (the label carries meaning).
 * `solid` adds a quiet tinted background for dense tables.
 */
export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium',
        t.text,
        className
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', t.dot)} aria-hidden />
      {children}
    </span>
  );
}

/** Technical tag (grade, condition, unit) set in mono caps. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs border border-graphite/15 px-1.5 py-px font-mono text-xs font-medium uppercase tracking-[0.04em] text-slate-700',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Small count next to tabs / headings. */
export function Count({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs tabular-nums text-slate-500', className)}>{children}</span>;
}
