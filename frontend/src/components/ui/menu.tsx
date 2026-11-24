'use client';

// ============================================================================
// Accessible dropdown menu (menu button pattern).
//  - Opens on click / Enter / Space / ArrowDown; closes on Escape, outside click,
//    Tab, or after choosing an item (unless the item keeps it open).
//  - Arrow keys / Home / End move focus between items; focus returns to the trigger.
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/components/motion';

interface MenuCtx {
  close: (focusTrigger?: boolean) => void;
}
const Ctx = createContext<MenuCtx | null>(null);

export function Menu({
  trigger,
  label,
  children,
  align = 'start',
  width = 'w-60',
  triggerClassName,
  className,
}: {
  /** Visible trigger content. */
  trigger: ReactNode;
  /** Accessible name when the trigger has no text. */
  label?: string;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: string;
  triggerClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  // The panel is portalled to <body> with fixed coordinates so scroll containers
  // (e.g. overflow-x tables) never clip it. It flips upward near the viewport bottom.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number; up: boolean } | null>(null);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom;
    setPos({
      up,
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      ...(align === 'end' ? { right: window.innerWidth - r.right } : { left: r.left }),
    });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    // Focus the first item on open.
    const raf = requestAnimationFrame(() => items()[0]?.focus());
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const items = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);

  const onListKey = (e: KeyboardEvent) => {
    const list = items();
    const idx = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(idx + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(idx - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-sm border border-graphite/15 bg-cream-paper px-2.5 text-[13px] font-medium text-graphite transition-colors duration-fast hover:border-graphite/35',
          open && 'border-graphite/40',
          triggerClassName
        )}
      >
        {trigger}
        <ChevronDown className={cn('size-3.5 text-slate-500 transition-transform duration-base ease-out', open && 'rotate-180')} aria-hidden />
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={listRef}
                id={id}
                role="menu"
                onKeyDown={onListKey}
                initial={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  bottom: pos.bottom,
                  left: pos.left,
                  right: pos.right,
                  transformOrigin: `${pos.up ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}`,
                }}
                className={cn(
                  'z-[70] max-h-[60vh] max-w-[calc(100vw-2rem)] overflow-auto rounded-md border border-graphite/10 bg-cream-paper p-1 shadow-float',
                  width
                )}
              >
                <Ctx.Provider value={{ close }}>{children}</Ctx.Provider>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

const itemClass =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] text-graphite outline-none transition-colors duration-fast hover:bg-graphite/[0.05] focus:bg-graphite/[0.06] aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

export function MenuItem({
  children,
  onSelect,
  disabled,
  icon,
  hint,
  keepOpen,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  hint?: ReactNode;
  keepOpen?: boolean;
}) {
  const ctx = useContext(Ctx);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        if (!keepOpen) ctx?.close();
      }}
      className={itemClass}
    >
      {icon && <span className="text-slate-500">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {hint && <span className="block text-xs text-slate-600">{hint}</span>}
      </span>
    </button>
  );
}

/** Single- or multi-select item with a check mark. */
export function MenuCheckItem({
  checked,
  onCheckedChange,
  children,
  radio,
  keepOpen = !radio,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  radio?: boolean;
  keepOpen?: boolean;
}) {
  const ctx = useContext(Ctx);
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : 'menuitemcheckbox'}
      aria-checked={checked}
      tabIndex={-1}
      onClick={() => {
        onCheckedChange(radio ? true : !checked);
        if (!keepOpen) ctx?.close();
      }}
      className={itemClass}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center border',
          radio ? 'rounded-full' : 'rounded-xs',
          checked ? 'border-copper-600 bg-copper-600 text-white' : 'border-graphite/25'
        )}
        aria-hidden
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/**
 * Non-modal popover panel for small forms (filters, ranges). Unlike Menu it does
 * not capture arrow keys, so inputs inside behave normally.
 * Escape / outside click / focus leaving the panel closes it.
 */
export function Popover({
  trigger,
  label,
  children,
  align = 'start',
  width = 'w-80',
  triggerClassName,
  active = false,
}: {
  trigger: ReactNode;
  label?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  width?: string;
  triggerClassName?: string;
  /** Highlights the trigger (e.g. when filters are applied). */
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>('input,select,button,[tabindex]:not([tabindex="-1"])')?.focus()
    );
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[13px] font-medium transition-colors duration-fast',
          active ? 'border-copper/60 bg-copper-50 text-copper-800' : 'border-graphite/15 bg-cream-paper text-graphite hover:border-graphite/35',
          open && 'border-graphite/40',
          triggerClassName
        )}
      >
        {trigger}
        <ChevronDown className={cn('size-3.5 text-slate-500 transition-transform duration-base ease-out', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className={cn(
              'absolute top-full z-40 mt-1.5 max-h-[75vh] max-w-[calc(100vw-2rem)] overflow-auto rounded-md border border-graphite/10 bg-cream-paper p-4 shadow-float',
              align === 'end' ? 'right-0' : 'left-0',
              width
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="t-label px-2.5 pb-1 pt-2">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-graphite/10" />;
}
