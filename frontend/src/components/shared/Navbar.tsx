'use client';

// ============================================================================
// MONOLOOP global navigation.
//  Desktop: Trade mega menu (marketplace, inventory, requirements + quick
//  actions) · Matching · Exchanges · Impact · Messages · account menu.
//  Mobile: animated drawer with the same structure.
//  Visibility rules are unchanged: in company-login mode only approved
//  companies and admins see the product links; admins also get Admin.
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ClipboardList,
  Cpu,
  LogOut,
  Menu as MenuIcon,
  MessageCircle,
  Plus,
  ShieldCheck,
  Store,
  TrendingUp,
  UserRound,
  Warehouse,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { EASE_OUT, transition } from '@/components/motion';
import { Menu, MenuItem, MenuLabel, MenuSeparator, StatusBadge } from '@/components/ui';
import { UnreadBadge } from '@/features/chat/components/UnreadBadge';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Messages } from '@/lib/i18n/en';
import { useT } from '@/lib/i18n/I18nProvider';
import { LanguageToggle } from './LanguageToggle';
import { cn } from '@/lib/utils';
import { Wordmark } from './Wordmark';

type Icon = ComponentType<{ className?: string }>;

interface NavEntry {
  href: string;
  label: string;
  description: string;
  icon: Icon;
  /** Is this entry the current page? */
  match: (path: string, scope: string | null) => boolean;
}

const trade = (t: Messages['nav']): NavEntry[] => [
  {
    href: '/supply?scope=all',
    label: t.marketplace,
    description: t.marketplaceDesc,
    icon: Store,
    match: (p, s) => p.startsWith('/supply') && s === 'all',
  },
  {
    href: '/supply',
    label: t.inventory,
    description: t.inventoryDesc,
    icon: Warehouse,
    match: (p, s) => p.startsWith('/supply') && s !== 'all',
  },
  {
    href: '/demand',
    label: t.requirements,
    description: t.requirementsDesc,
    icon: ClipboardList,
    match: (p) => p.startsWith('/demand'),
  },
];

const primaryEntries = (t: Messages['nav']): NavEntry[] => [
  {
    href: '/matches',
    label: t.matching,
    description: t.matchingDesc,
    icon: Cpu,
    match: (p) => p.startsWith('/matches'),
  },
  {
    href: '/exchanges',
    label: t.exchanges,
    description: t.exchangesDesc,
    icon: ArrowLeftRight,
    match: (p) => p.startsWith('/exchanges'),
  },
  {
    href: '/impact',
    label: t.impact,
    description: t.impactDesc,
    icon: TrendingUp,
    match: (p) => p.startsWith('/impact'),
  },
];

const adminEntry = (t: Messages['nav']): NavEntry => ({
  href: '/admin',
  label: t.admin,
  description: t.adminDesc,
  icon: ShieldCheck,
  match: (p) => p.startsWith('/admin'),
});

export function Navbar() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<header className="sticky top-0 z-50 h-16 border-b border-transparent bg-cream/90" />}>
      <NavbarInner />
    </Suspense>
  );
}

function NavbarInner() {
  const pathname = usePathname() || '/';
  const scope = useSearchParams().get('scope');
  const router = useRouter();
  const { mode, profile, logout } = useAuth();
  const t = useT();
  const n = t.nav;
  const TRADE = trade(n);
  const [drawer, setDrawer] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const signedIn = mode === 'jwt' && !!profile;
  const isAdmin = profile?.role === 'admin';
  const canBrowse = mode !== 'jwt' || isAdmin || profile?.organization?.status === 'APPROVED';
  // With login on, platform-wide Impact is for admins only.
  const visible = primaryEntries(n).filter((e) => e.href !== '/impact' || mode !== 'jwt' || isAdmin);
  const primary = isAdmin ? [...visible, adminEntry(n)] : visible;
  const canCreate = canBrowse && !isAdmin;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the drawer on navigation.
  useEffect(() => setDrawer(false), [pathname, scope]);

  const signOut = () => {
    logout();
    router.replace('/login');
  };

  const tradeActive = TRADE.some((e) => e.match(pathname, scope));

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b bg-cream/90 backdrop-blur-md transition-[border-color,background-color] duration-base supports-[backdrop-filter]:bg-cream/75',
        scrolled ? 'border-graphite/10' : 'border-transparent'
      )}
    >
      <div className="page-shell flex h-16 items-center gap-6">
        <Link href="/" className="shrink-0 rounded-sm" aria-label={n.home}>
          <Wordmark />
        </Link>

        {canBrowse && (
          <nav aria-label={n.main} className="hidden items-center gap-1 lg:flex">
            <TradeMenu entries={TRADE} pathname={pathname} scope={scope} active={tradeActive} canCreate={canCreate} />
            {primary.map((e) => (
              <NavLink key={e.href} href={e.href} active={e.match(pathname, scope)}>
                {e.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {mode === 'demo' && (
            <span className="hidden xl:inline-flex" title={n.demoHint}>
              <StatusBadge tone="warning">{n.demoBadge}</StatusBadge>
            </span>
          )}

          <LanguageToggle className="hidden sm:inline-flex" />

          {canBrowse && <NotificationBell />}

          {canBrowse && (
            <Link
              href="/messages"
              className={cn(
                'relative inline-flex h-9 items-center gap-2 rounded-sm px-2.5 text-[14px] font-medium transition-colors duration-fast',
                pathname.startsWith('/messages') ? 'text-graphite' : 'text-slate-600 hover:bg-graphite/[0.05] hover:text-graphite'
              )}
              aria-current={pathname.startsWith('/messages') ? 'page' : undefined}
            >
              <MessageCircle className="size-4" aria-hidden />
              <span className="hidden xl:inline">{n.messages}</span>
              <span className="sr-only xl:hidden">{n.messages}</span>
              <UnreadBadge />
            </Link>
          )}

          {mode === 'jwt' && !signedIn && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link href="/login" className="inline-flex h-9 items-center rounded-sm px-3 text-[14px] font-medium text-graphite hover:bg-graphite/[0.05]">
                {t.common.signIn}
              </Link>
              <Link href="/signup" className="inline-flex h-9 items-center rounded-sm bg-copper-600 px-3.5 text-[14px] font-medium text-white hover:bg-copper-700">
                {t.common.register}
              </Link>
            </div>
          )}

          {signedIn && (
            <div className="hidden lg:block">
              <Menu
                align="end"
                width="w-64"
                label={n.accountMenu}
                triggerClassName="h-9 border-transparent bg-transparent px-2 hover:bg-graphite/[0.05] hover:border-transparent"
                trigger={
                  <span className="inline-flex max-w-[11rem] items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-graphite text-cream">
                      {isAdmin ? <ShieldCheck className="size-3.5" aria-hidden /> : <Building2 className="size-3.5" aria-hidden />}
                    </span>
                    <span className="truncate text-[14px]">{isAdmin ? n.administrator : profile?.organization?.name}</span>
                  </span>
                }
              >
                <MenuLabel>{n.signedInAs}</MenuLabel>
                <p className="truncate px-2.5 pb-2 text-[14px] text-graphite">{profile?.email}</p>
                <MenuSeparator />
                <MenuItem icon={<UserRound className="size-4" />} onSelect={() => router.push('/account')}>
                  {n.myAccount}
                </MenuItem>
                {isAdmin && (
                  <MenuItem icon={<ShieldCheck className="size-4" />} onSelect={() => router.push('/admin')}>
                    {n.applications}
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem icon={<LogOut className="size-4" />} onSelect={signOut}>
                  {t.common.signOut}
                </MenuItem>
              </Menu>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-graphite hover:bg-graphite/[0.06] lg:hidden"
            aria-label={n.openNav}
            aria-expanded={drawer}
            aria-controls="mobile-nav"
          >
            <MenuIcon className="size-5" />
          </button>
        </div>
      </div>

      <MobileDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        pathname={pathname}
        scope={scope}
        canBrowse={canBrowse}
        canCreate={canCreate}
        trade={TRADE}
        primary={primary}
        footer={
          mode === 'jwt' ? (
            signedIn ? (
              <div className="space-y-3">
                <div className="min-w-0">
                  <p className="t-label">{n.signedIn}</p>
                  <p className="truncate text-sm text-graphite">{isAdmin ? n.administrator : profile?.organization?.name}</p>
                  <p className="truncate text-xs text-slate-600">{profile?.email}</p>
                </div>
                <div className="flex gap-2">
                  <Link href="/account" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-sm border border-graphite/20 text-sm font-medium">
                    <UserRound className="size-4" aria-hidden /> {n.account}
                  </Link>
                  <button type="button" onClick={signOut} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-sm bg-graphite text-sm font-medium text-cream">
                    <LogOut className="size-4" aria-hidden /> {t.common.signOut}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" className="inline-flex h-10 flex-1 items-center justify-center rounded-sm border border-graphite/20 text-sm font-medium">
                  {t.common.signIn}
                </Link>
                <Link href="/signup" className="inline-flex h-10 flex-1 items-center justify-center rounded-sm bg-copper-600 text-sm font-medium text-white">
                  {t.common.register}
                </Link>
              </div>
            )
          ) : mode === 'demo' ? (
            <StatusBadge tone="warning">{n.demoDrawer}</StatusBadge>
          ) : null
        }
      />
    </header>
  );
}

/* ----------------------------------------------------------------- pieces */

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex h-9 items-center rounded-sm px-3 text-[14px] font-medium transition-colors duration-fast',
        active ? 'text-graphite' : 'text-slate-600 hover:bg-graphite/[0.05] hover:text-graphite'
      )}
    >
      {children}
      {active && <ActiveRule />}
    </Link>
  );
}

function ActiveRule() {
  return (
    <motion.span
      layoutId="nav-active"
      transition={transition.layout}
      className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-copper"
      aria-hidden
    />
  );
}

/** Trade mega menu: opens on hover (with intent delay), click, or keyboard. */
function TradeMenu({
  entries,
  pathname,
  scope,
  active,
  canCreate,
}: {
  entries: NavEntry[];
  pathname: string;
  scope: string | null;
  active: boolean;
  canCreate: boolean;
}) {
  const n = useT().nav;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const close = useCallback((focus = false) => {
    setOpen(false);
    if (focus) buttonRef.current?.focus();
  }, []);

  useEffect(() => close(), [pathname, scope, close]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const hoverOpen = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 80);
  };
  const hoverClose = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 160);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(e) => e.pointerType === 'mouse' && hoverOpen()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hoverClose()}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="trade-menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative inline-flex h-9 items-center gap-1 rounded-sm px-3 text-[14px] font-medium transition-colors duration-fast',
          active || open ? 'text-graphite' : 'text-slate-600 hover:bg-graphite/[0.05] hover:text-graphite'
        )}
      >
        {n.trade}
        <ChevronDown className={cn('size-3.5 transition-transform duration-base ease-out', open && 'rotate-180')} aria-hidden />
        {active && <ActiveRule />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="trade-menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="absolute left-0 top-full z-50 pt-3"
          >
            <div className="grid w-[40rem] grid-cols-[1fr_15rem] overflow-hidden rounded-md border border-graphite/10 bg-cream-paper shadow-float">
              <ul className="space-y-0.5 p-2">
                {entries.map((e) => {
                  const current = e.match(pathname, scope);
                  return (
                    <li key={e.href}>
                      <Link
                        href={e.href}
                        aria-current={current ? 'page' : undefined}
                        className="group flex items-start gap-3 rounded-sm p-3 transition-colors duration-fast hover:bg-sand-50 focus-visible:bg-sand-50"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border transition-colors',
                            current ? 'border-copper bg-copper-50 text-copper-700' : 'border-graphite/10 text-slate-600 group-hover:border-copper/50 group-hover:text-copper-700'
                          )}
                        >
                          <e.icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-graphite">
                            {e.label}
                            <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition-all duration-base group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                          </span>
                          <span className="block text-[14px] text-slate-600">{e.description}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-col justify-between gap-6 border-l border-graphite/10 bg-sand-50 p-5">
                <div className="space-y-3">
                  <p className="t-label">{n.quickActions}</p>
                  {canCreate ? (
                    <ul className="space-y-1">
                      <li>
                        <Link href="/supply?compose=1" className="group flex items-center gap-2 py-1.5 text-sm font-medium text-graphite hover:text-copper-700">
                          <Plus className="size-4 text-copper-600" aria-hidden /> {n.listSurplus}
                        </Link>
                      </li>
                      <li>
                        <Link href="/demand?compose=1" className="group flex items-center gap-2 py-1.5 text-sm font-medium text-graphite hover:text-copper-700">
                          <Plus className="size-4 text-copper-600" aria-hidden /> {n.postRequirement}
                        </Link>
                      </li>
                    </ul>
                  ) : (
                    <p className="text-[14px] text-slate-600">{n.adminNoTrade}</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileDrawer({
  open,
  onClose,
  pathname,
  scope,
  canBrowse,
  canCreate,
  trade: tradeEntries,
  primary,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  scope: string | null;
  canBrowse: boolean;
  canCreate: boolean;
  trade: NavEntry[];
  primary: NavEntry[];
  footer: ReactNode;
}) {
  const n = useT().nav;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('button, a')?.focus());
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const item = (e: NavEntry) => {
    const current = e.match(pathname, scope);
    return (
      <li key={e.href}>
        <Link
          href={e.href}
          onClick={onClose}
          aria-current={current ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 border-l-2 py-3 pl-4 pr-2 transition-colors',
            current ? 'border-copper text-graphite' : 'border-transparent text-graphite/80 hover:text-graphite'
          )}
        >
          <e.icon className={cn('size-4', current ? 'text-copper-700' : 'text-slate-500')} />
          <span className="min-w-0">
            <span className="block text-[15px] font-medium">{e.label}</span>
            <span className="block truncate text-xs text-slate-600">{e.description}</span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" id="mobile-nav">
          <motion.div
            className="absolute inset-0 bg-graphite/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={n.navigation}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-cream shadow-dialog"
          >
            <div className="flex h-16 items-center justify-between border-b border-graphite/10 px-5">
              <Wordmark />
              <button type="button" onClick={onClose} className="rounded-sm p-2 text-graphite hover:bg-graphite/[0.06]" aria-label={n.closeNav}>
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label={n.mobile} className="flex-1 overflow-y-auto px-3 py-5">
              <LanguageToggle className="mb-5 ml-4" />
              {canBrowse ? (
                <div className="space-y-6">
                  <div>
                    <p className="t-label px-4 pb-1">{n.trade}</p>
                    <ul>{tradeEntries.map(item)}</ul>
                  </div>
                  <div>
                    <p className="t-label px-4 pb-1">{n.coordinate}</p>
                    <ul>
                      {primary.map(item)}
                      {item({
                        href: '/messages',
                        label: n.messages,
                        description: n.messagesDesc,
                        icon: MessageCircle,
                        match: (p) => p.startsWith('/messages'),
                      })}
                    </ul>
                  </div>
                  {canCreate && (
                    <div className="flex gap-2 px-1">
                      <Link href="/supply?compose=1" onClick={onClose} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-sm bg-copper-600 text-sm font-medium text-white">
                        <Plus className="size-4" aria-hidden /> {n.listSurplus}
                      </Link>
                      <Link href="/demand?compose=1" onClick={onClose} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-sm border border-graphite/20 text-sm font-medium">
                        <Plus className="size-4" aria-hidden /> {n.requirementShort}
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <p className="px-4 text-sm text-slate-600">{n.signInToBrowse}</p>
              )}
            </nav>
            {footer && <div className="border-t border-graphite/10 px-5 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
