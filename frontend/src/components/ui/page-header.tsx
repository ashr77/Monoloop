import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Editorial application header: eyebrow, title, description, actions — separated
 * from the content by a hairline rule rather than a card.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Optional row under the title (metrics, context switchers). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('border-b rule pb-8 pt-10 sm:pt-12', className)}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl space-y-3">
          {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
          <h1 className="text-heading-lg font-medium text-graphite sm:text-[2.5rem] sm:leading-[1.05]">{title}</h1>
          {description && <p className="max-w-prose text-[15px] leading-relaxed text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
      </div>
      {children && <div className="mt-8">{children}</div>}
    </header>
  );
}

/** Section title inside a page: index number + heading + optional hint and action. */
export function SectionHeading({
  index,
  title,
  hint,
  action,
  id,
  className,
}: {
  index?: string;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex items-baseline gap-4">
        {index && <span className="font-mono text-xs text-copper-700">{index}</span>}
        <div className="space-y-1">
          <h2 id={id} className="text-heading-md font-medium">
            {title}
          </h2>
          {hint && <p className="text-sm text-slate-600">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
