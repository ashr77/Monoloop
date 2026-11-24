'use client';

// ============================================================================
// Modal dialog and side drawer.
//  - Escape and backdrop click close (unless `dismissible={false}` while busy).
//  - Focus moves into the dialog, Tab is trapped, focus returns on close.
//  - Body scroll is locked while open.
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/components/motion';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useDialogBehaviour(open: boolean, onClose: () => void, dismissible: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]');
      const first = auto ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible]);

  return panelRef;
}

/** Portals render only after mount, so server and first client render match (no hydration mismatch). */
function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Set false while a request is in flight so the dialog can't be dismissed mid-save. */
  dismissible?: boolean;
}) {
  const panelRef = useDialogBehaviour(open, onClose, dismissible);
  const titleId = useId();
  const descId = useId();
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="dialog"
            className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-graphite/45 backdrop-blur-[2px]" onClick={dismissible ? onClose : undefined} aria-hidden />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              initial={{ opacity: 0, y: 24, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.985, transition: { duration: 0.16 } }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
              className={cn(
                'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg bg-cream shadow-dialog outline-none sm:rounded-md',
                width
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b rule px-5 py-4 sm:px-6">
                <div className="min-w-0 space-y-1">
                  {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
                  <h2 id={titleId} className="text-lg font-medium tracking-[-0.02em]">
                    {title}
                  </h2>
                  {description && (
                    <p id={descId} className="text-sm text-slate-600">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={!dismissible}
                  className="-mr-1.5 rounded-sm p-1.5 text-slate-500 transition-colors hover:bg-graphite/[0.06] hover:text-graphite disabled:opacity-40"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
              {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t rule bg-cream-paper px-5 py-3.5 sm:px-6">{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** Confirmation dialog for consequential actions (archive, cancel, confirm transfer). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-sm border border-graphite/20 px-4 text-sm font-medium text-graphite hover:bg-graphite/[0.04] disabled:opacity-50"
          >
            Keep as is
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            data-autofocus
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-sm px-4 text-sm font-medium text-white disabled:opacity-60',
              tone === 'danger' ? 'bg-brick-600 hover:bg-brick-700' : 'bg-copper-600 hover:bg-copper-700'
            )}
          >
            {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
