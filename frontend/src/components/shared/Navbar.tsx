'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Layers, Package, FileText, Cpu, ArrowLeftRight, Activity, Sparkles, MessageCircle } from 'lucide-react';
import { UnreadBadge } from '@/features/chat/components/UnreadBadge';
import { useState } from 'react';
import { Menu, X, LogOut, ShieldCheck, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: Layers },
    { href: '/supply', label: 'Supply', icon: Package },
    { href: '/demand', label: 'Demand', icon: FileText },
    { href: '/matches/d1111111-1111-4111-d111-111111111111', label: 'Matches', icon: Cpu },
    { href: '/exchanges', label: 'Exchanges', icon: ArrowLeftRight, badge: 'Member 4' },
    { href: '/impact', label: 'Impact', icon: Activity, badge: 'Member 4' },
    { href: '/messages', label: 'Messages', icon: MessageCircle },
  ];

  // Company accounts (AUTH_MODE=jwt): menu only for approved companies and admins.
  const { mode, profile, logout } = useAuth();
  const router = useRouter();
  const signedIn = mode === 'jwt' && !!profile;
  const canBrowse = mode !== 'jwt' || profile?.role === 'admin' || profile?.organization?.status === 'APPROVED';
  const links = !canBrowse
    ? []
    : profile?.role === 'admin'
      ? [...navLinks, { href: '/admin', label: 'Admin', icon: ShieldCheck }]
      : navLinks;
  const signOut = () => {
    logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-slate-900 tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-extrabold shadow-sm">
              M
            </span>
            <span>MONOLOOP</span>
          </Link>
          <span className="hidden md:inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
            TSUNAGU 2026
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{link.label}</span>
                {link.href === '/messages' && <UnreadBadge />}
              </Link>
            );
          })}
        </nav>

        {/* Demo Tag */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="md:hidden rounded-lg border border-slate-200 p-2 text-slate-600"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {mode === 'jwt' ? (
            signedIn ? (
              <div className="flex items-center gap-2">
                <Link href="/account" title="My account" className={`${profile?.role === 'admin' ? 'inline-flex' : 'hidden lg:inline-flex'} items-center gap-1.5 max-w-[9rem] truncate px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-800`}>
                  {profile?.role === 'admin' ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Building2 className="w-3.5 h-3.5 text-slate-500" />}
                  {profile?.role === 'admin' ? <span className="sr-only">My account</span> : profile?.organization?.name}
                </Link>
                <button
                  onClick={signOut}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" /> <span className="hidden 2xl:inline">Sign out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Link href="/login" className="rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50">Sign in</Link>
                <Link href="/signup" className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-white hover:bg-emerald-700">Register</Link>
              </div>
            )
          ) : (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline font-medium">Synthetic Demo Mode</span>
          </div>
          )}
        </div>
      </div>
      {mobileOpen && (
        <nav className="md:hidden border-t border-slate-200 bg-white px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive =
                pathname === link.href ||
                (link.href !== '/' && pathname.startsWith(link.href.split('/').slice(0, 2).join('/')));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {link.label}
                  {link.href === '/messages' && <UnreadBadge />}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
