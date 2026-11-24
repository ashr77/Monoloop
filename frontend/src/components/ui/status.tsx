import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'copper' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONES: Record<Tone, { text: string; dot: string; bg: string }> = {
  neutral: { text: 'text-graphite', dot: 'bg-graphite', bg: 'bg-graphite/[0.06]' },
  copper: { text: 'text-copper-700', dot: 'bg-copper', bg: 'bg-copper-50' },
  success: { text: 'text-moss-700', dot: 'bg-moss-600', bg: 'bg-moss-50' },
  warning: { text: 'text-ochre-700', dot: 'bg-ochre-500', bg: 'bg-ochre-50' },
  danger: { text: 'text-brick-700', dot: 'bg-brick-600', bg: 'bg-brick-50' },
  info: { text: 'text-slate-800', dot: 'bg-slate-500', bg: 'bg-slate-100' },
  muted: { text: 'text-slate-600', dot: 'bg-slate-400', bg: 'bg-graphite/[0.04]' },
};

/**
 * Status label: a coloured dot + text. Colour is never the only signal (the label carries meaning).
 * `solid` adds a quiet tinted background for dense tables.
 */
export function StatusBadge({
  tone = 'neutral',
  children,
  solid = false,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  solid?: boolean;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium',
        solid && `rounded-xs px-2 py-0.5 ${t.bg}`,
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
        'inline-flex items-center rounded-xs border border-graphite/15 px-1.5 py-px font-mono text-[10.5px] font-medium uppercase tracking-[0.04em] text-slate-700',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Small count next to tabs / headings. */
export function Count({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[11px] tabular-nums text-slate-500', className)}>{children}</span>;
}
