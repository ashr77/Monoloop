'use client';

import { motion } from 'framer-motion';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { transition } from '@/components/motion';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  /** Accessible label when `label` is an icon. */
  ariaLabel?: string;
}

/**
 * Segmented control / tab strip with a sliding indicator.
 * `variant="tabs"` renders an underline (section navigation); `"pill"` a compact toggle (view options).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  variant = 'pill',
  size = 'sm',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  variant?: 'pill' | 'tabs';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const layoutId = useId();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % options.length;
    if (e.key === 'ArrowLeft') next = (idx - 1 + options.length) % options.length;
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      btns[next]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn(
        'relative inline-flex items-center',
        variant === 'pill' ? 'gap-0.5 rounded-sm border border-graphite/15 bg-cream-paper p-0.5' : 'gap-5 border-b rule',
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-fast',
              variant === 'pill'
                ? cn(size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]', 'rounded-xs', active ? 'text-cream' : 'text-slate-600 hover:text-graphite')
                : cn('-mb-px pb-3 pt-1 text-sm', active ? 'text-graphite' : 'text-slate-600 hover:text-graphite')
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={transition.layout}
                className={cn('absolute', variant === 'pill' ? 'inset-0 rounded-xs bg-graphite' : 'inset-x-0 bottom-0 h-0.5 bg-copper')}
                aria-hidden
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {o.label}
              {o.count !== undefined && (
                <span className={cn('font-mono text-[11px] tabular-nums', active && variant === 'pill' ? 'text-cream/70' : 'text-slate-500')}>
                  {o.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
