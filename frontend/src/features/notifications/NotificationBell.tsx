'use client';

// ============================================================================
// Navbar bell: order and payment events for the acting company.
// Count badge on the icon; the panel lists the latest notifications and each
// one opens the exchange it is about (and is marked read).
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban,
  Banknote,
  Bell,
  CheckCheck,
  CircleCheck,
  CircleX,
  PackageCheck,
  PackagePlus,
  RotateCw,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { EASE_OUT } from '@/components/motion';
import { Skeleton } from '@/components/ui';
import { useChatIdentity, useMarkNotificationsRead, useNotifications } from '@/hooks';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationKind } from './types';

const KIND: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  ORDER_RECEIVED: { icon: PackagePlus, tone: 'text-copper-700 bg-copper-50' },
  ITEM_ACCEPTED: { icon: CircleCheck, tone: 'text-moss-700 bg-moss-50' },
  ORDER_RESERVED: { icon: CircleCheck, tone: 'text-moss-700 bg-moss-50' },
  ITEM_DECLINED: { icon: CircleX, tone: 'text-brick-700 bg-brick-50' },
  ORDER_CANCELLED: { icon: Ban, tone: 'text-slate-600 bg-graphite/[0.06]' },
  ORDER_COMPLETED: { icon: PackageCheck, tone: 'text-moss-700 bg-moss-50' },
  PAYMENT_RECEIVED: { icon: Banknote, tone: 'text-copper-700 bg-copper-50' },
};

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 3600 ? [Math.round(seconds / 60), 'minute']
    : abs < 86400 ? [Math.round(seconds / 3600), 'hour']
    : abs < 86400 * 30 ? [Math.round(seconds / 86400), 'day']
    : [Math.round(seconds / (86400 * 30)), 'month'];
  return rtf ? rtf.format(value, unit) : new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const { organization, organizations, setOrganization, locked } = useChatIdentity();
  const orgId = organization?.id ?? null;
  const feed = useNotifications(orgId);
  const markRead = useMarkNotificationsRead(orgId);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  // Close on navigation, outside click and Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Refresh as soon as the panel opens, so it never shows a stale list.
  const { refetch } = feed;
  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  if (!orgId) return null; // admins act for no company: nothing to notify

  const items = feed.data?.items ?? [];
  const unread = feed.data?.unreadTotal ?? 0;

  const openNotification = (n: AppNotification) => {
    if (!n.read) markRead.mutate({ ids: [n.id] });
    close(false);
    const params = new URLSearchParams({ highlight: n.exchange_id });
    if (!locked) params.set('as', orgId); // demo identity: open the exchanges page as this company
    router.push(`/exchanges?${params}`);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className={cn(
          'relative inline-flex size-9 items-center justify-center rounded-sm transition-colors duration-fast',
          open ? 'bg-graphite/[0.06] text-graphite' : 'text-slate-600 hover:bg-graphite/[0.05] hover:text-graphite'
        )}
      >
        <Bell className="size-[1.125rem]" aria-hidden />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="count"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="absolute -right-0.5 -top-0.5 inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-copper-600 px-1 font-mono text-[10.5px] font-medium tabular-nums leading-none text-white ring-2 ring-cream"
              aria-hidden
            >
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {unread ? `${unread} unread notifications` : ''}
      </span>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="fixed inset-x-3 top-[4.25rem] z-[60] flex max-h-[min(34rem,calc(100vh-5.5rem))] flex-col overflow-hidden rounded-md border border-graphite/10 bg-cream-paper shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[24rem]"
          >
            <div className="flex items-center justify-between gap-3 border-b rule px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-graphite">Notifications</p>
                {locked ? (
                  <p className="truncate text-xs text-slate-600">Orders and payments for {organization?.name}</p>
                ) : (
                  <label className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                    <span className="shrink-0">For</span>
                    <select
                      value={orgId}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="min-w-0 max-w-[13rem] truncate rounded-xs bg-transparent font-medium text-graphite underline decoration-graphite/30 underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                      aria-label="Show notifications for company"
                    >
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead.mutate({ all: true })}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-copper-700 hover:bg-copper-50"
                >
                  <CheckCheck className="size-3.5" aria-hidden /> Mark all read
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {feed.isPending ? (
                <div className="space-y-4 p-4" role="status" aria-label="Loading notifications">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="size-8 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-2.5 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : feed.isError ? (
                <div className="space-y-2 p-4 text-sm">
                  <p className="text-brick-700">Notifications could not be loaded.</p>
                  <button type="button" onClick={() => void feed.refetch()} className="link inline-flex items-center gap-1.5">
                    <RotateCw className="size-3.5" aria-hidden /> Try again
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <Bell className="size-6 text-slate-400" aria-hidden />
                  <p className="text-sm font-medium text-graphite">No notifications yet</p>
                  <p className="text-xs leading-relaxed text-slate-600">
                    You&apos;ll see new orders for your listings, replies to your orders and payments here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-graphite/[0.07]">
                  {items.map((n) => {
                    const { icon: Icon, tone } = KIND[n.kind] ?? KIND.ORDER_RECEIVED;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
                          className={cn(
                            'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-graphite/[0.035] focus-visible:bg-graphite/[0.05] focus-visible:outline-none',
                            !n.read && 'bg-copper-50/50'
                          )}
                        >
                          <span className={cn('mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className={cn('text-[13px] leading-snug text-graphite', n.read ? 'font-normal' : 'font-medium')}>
                                {n.title}
                              </span>
                              {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-copper-600" aria-label="Unread" />}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-slate-600">{n.message}</span>
                            <span className="mt-1 block font-mono text-[11px] text-slate-500">{timeAgo(n.created_at)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t rule px-4 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => {
                    close(false);
                    router.push(locked ? '/exchanges' : `/exchanges?as=${orgId}`);
                  }}
                  className="link text-xs"
                >
                  View all exchanges
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
