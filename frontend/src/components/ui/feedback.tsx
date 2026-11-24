'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/components/motion';

/* ------------------------------------------------------------------ toast */

export interface ToastMessage {
  kind: 'success' | 'error' | 'info';
  message: ReactNode;
}

/**
 * Transient confirmation in the bottom-right corner. Announced to screen readers.
 * Auto-dismisses after `duration` ms (errors stay twice as long).
 */
export function Toast({
  toast,
  onDismiss,
  duration = 4500,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
  duration?: number;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismissRef.current(), toast.kind === 'error' ? duration * 2 : duration);
    return () => clearTimeout(t);
  }, [toast, duration]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const Icon = toast?.kind === 'error' ? AlertTriangle : toast?.kind === 'info' ? Info : CheckCircle2;
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex justify-end sm:inset-x-auto sm:right-6 sm:bottom-6" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={String(toast.message)}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-md bg-graphite py-3 pl-4 pr-2 text-sm text-cream shadow-dialog"
          >
            <Icon
              className={cn('mt-0.5 size-4 shrink-0', toast.kind === 'error' ? 'text-brick-100' : toast.kind === 'info' ? 'text-sand' : 'text-copper-300')}
              aria-hidden
            />
            <span className="min-w-0 flex-1 leading-relaxed">{toast.message}</span>
            <button type="button" onClick={onDismiss} className="rounded-sm p-1 text-cream/60 hover:text-cream" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

/* --------------------------------------------------------------- skeleton */

export function Skeleton({ className }: { className?: string }) {
  return (
    <span className={cn('relative block overflow-hidden rounded-xs bg-graphite/[0.07]', className)} aria-hidden>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-cream/70 to-transparent" />
    </span>
  );
}

/** Placeholder rows shaped like a data table. */
export function TableSkeleton({ rows = 5, columns = 6, label = 'Loading' }: { rows?: number; columns?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-graphite/[0.08] border-y rule">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 py-4" style={{ opacity: 1 - r * 0.12 }}>
          <div className="w-1/4 min-w-[8rem] space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          {Array.from({ length: columns - 1 }).map((__, c) => (
            <Skeleton key={c} className={cn('hidden h-3 flex-1 sm:block', c % 2 ? 'max-w-[6rem]' : 'max-w-[9rem]')} />
          ))}
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/* ------------------------------------------------------------ empty state */

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 border-y border-dashed border-graphite/20 px-1 py-12 sm:items-center sm:text-center', className)}>
      {icon && <span className="text-copper-600">{icon}</span>}
      <p className="text-lg font-medium tracking-[-0.02em] text-graphite">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ error state */

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: ReactNode;
  message: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-2 border-l-2 border-brick-600 bg-brick-50/60 px-5 py-4', className)}>
      <p className="flex items-center gap-2 text-sm font-medium text-brick-700">
        <AlertTriangle className="size-4" aria-hidden /> {title}
      </p>
      <p className="text-sm text-graphite/80">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-graphite underline decoration-graphite/30 underline-offset-[3px] hover:decoration-graphite">
          <RotateCw className="size-3.5" aria-hidden /> Try again
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- callout */

/** Quiet explanatory note (replaces coloured alert boxes for non-urgent information). */
export function Note({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'danger'; className?: string }) {
  return (
    <div
      className={cn(
        'border-l-2 py-1 pl-4 text-sm leading-relaxed',
        tone === 'neutral' && 'border-copper text-slate-700',
        tone === 'warning' && 'border-ochre-500 text-ochre-700',
        tone === 'danger' && 'border-brick-600 text-brick-700',
        className
      )}
    >
      {children}
    </div>
  );
}
