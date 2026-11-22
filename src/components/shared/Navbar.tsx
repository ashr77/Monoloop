'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, Package, FileText, ArrowLeftRight, Activity, Sparkles } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Overview', icon: Layers },
    { href: '/supply', label: 'Supplier Portal', icon: Package, badge: 'Member 1' },
    { href: '/demand', label: 'Buyer Demand', icon: FileText, badge: 'Member 2' },
    { href: '/exchanges', label: 'Exchanges', icon: ArrowLeftRight, badge: 'Member 4' },
    { href: '/impact', label: 'Resource Impact', icon: Activity, badge: 'Member 4' },
  ];

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
          {navLinks.map((link) => {
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
              </Link>
            );
          })}
        </nav>

        {/* Demo Tag */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-medium">Synthetic Demo Mode</span>
          </div>
        </div>
      </div>
    </header>
  );
}
