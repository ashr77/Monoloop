'use client';

import { Search, X } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Search field with clear button. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-8 w-full rounded-sm border border-graphite/15 bg-cream-paper pl-8 pr-8 text-[13px] text-graphite placeholder:text-slate-500 transition-[border-color,box-shadow] duration-fast hover:border-graphite/35 focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xs p-1 text-slate-500 hover:text-graphite"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Compact native select styled for toolbars (keeps native keyboard + mobile pickers). */
export const ToolbarSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label: string; icon?: ReactNode; invalid?: boolean }
>(function ToolbarSelect({ label, icon, invalid, className, children, ...props }, ref) {
  return (
    <label
      className={cn(
        'relative inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-sm border bg-cream-paper pl-2.5 text-[13px] text-graphite transition-colors duration-fast focus-within:border-copper focus-within:ring-2 focus-within:ring-copper/20',
        invalid ? 'border-brick-500 ring-2 ring-brick-500/20' : 'border-graphite/15 hover:border-graphite/35',
        className
      )}
    >
      {icon && <span className="text-slate-500" aria-hidden>{icon}</span>}
      <span className="sr-only">{label}</span>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className="h-full min-w-0 max-w-full cursor-pointer appearance-none truncate bg-transparent pr-7 font-medium focus:outline-none"
        {...props}
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-2 size-3.5 text-slate-500" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
});

/** Small numeric input used in range filters. */
export function NumberField({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="t-label">{label}</span>
      <input type="number" inputMode="decimal" className="field mt-1 h-8 py-1 text-[13px]" {...props} />
    </label>
  );
}

/** Toolbar wrapper: wraps gracefully, keeps controls aligned. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

/** "Showing x of y" + Load more. */
export function LoadMore({
  shown,
  total,
  onMore,
  noun = 'records',
  className,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  noun?: string;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div className={cn('flex flex-col items-center gap-3 pt-6 sm:flex-row sm:justify-between', className)}>
      <p className="font-mono text-xs text-slate-600">
        Showing <span className="text-graphite">{shown}</span> of <span className="text-graphite">{total}</span> {noun}
      </p>
      {shown < total && (
        <button
          type="button"
          onClick={onMore}
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-graphite/20 px-4 text-sm font-medium text-graphite transition-colors hover:border-graphite/45 hover:bg-graphite/[0.04]"
        >
          Load more <span className="font-mono text-xs text-slate-500">{total - shown} left</span>
        </button>
      )}
    </div>
  );
}
