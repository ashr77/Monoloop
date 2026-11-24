import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Metric {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** Visual emphasis for the one figure that matters most. */
  emphasis?: boolean;
  tone?: 'default' | 'copper' | 'success' | 'warning';
}

const TONE: Record<NonNullable<Metric['tone']>, string> = {
  default: 'text-graphite',
  copper: 'text-copper-700',
  success: 'text-moss-700',
  warning: 'text-ochre-700',
};

/**
 * A row of figures divided by vertical hairlines — replaces rows of KPI cards.
 * Wraps to two columns on small screens.
 */
export function MetricStrip({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 border-y rule sm:flex', className)}>
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className={cn(
            'min-w-0 flex-1 space-y-1 border-graphite/10 py-4 pr-4',
            // mobile 2-col grid: hairline between columns and between rows
            i % 2 === 1 && 'border-l pl-4',
            i > 1 && 'border-t',
            // desktop: one row, hairline between every figure
            'sm:border-t-0 sm:px-6 sm:[&:not(:first-child)]:border-l sm:first:pl-0'
          )}
        >
          <dt className="t-label truncate">{m.label}</dt>
          <dd
            className={cn(
              'font-medium tabular-nums tracking-[-0.03em]',
              m.emphasis ? 'text-[2rem] leading-none' : 'text-2xl leading-tight',
              TONE[m.tone ?? 'default']
            )}
          >
            {m.value}
          </dd>
          {m.note && <dd className="truncate text-xs text-slate-600">{m.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Label/value pairs in a definition list. */
export function FactList({
  facts,
  className,
  columns = 2,
}: {
  facts: { label: string; value: ReactNode; note?: ReactNode }[];
  className?: string;
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4', cols, className)}>
      {facts.map((f) => (
        <div key={f.label} className="min-w-0 space-y-0.5">
          <dt className="t-label">{f.label}</dt>
          <dd className="text-sm font-medium text-graphite">{f.value}</dd>
          {f.note && <dd className="text-xs text-slate-600">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
