'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Messages } from '@/lib/i18n/en';
import { useT } from '@/lib/i18n/I18nProvider';
import { Wordmark } from './Wordmark';

const columnsFor = (f: Messages['footer']): { title: string; links: { href: string; label: string }[] }[] => [
  {
    title: f.trade,
    links: [
      { href: '/supply?scope=all', label: f.marketplace },
      { href: '/supply', label: f.inventory },
      { href: '/demand', label: f.requirements },
    ],
  },
  {
    title: f.coordinate,
    links: [
      { href: '/matches', label: f.matching },
      { href: '/exchanges', label: f.exchanges },
      { href: '/messages', label: f.messages },
    ],
  },
  {
    title: f.company,
    links: [
      { href: '/impact', label: f.recovery },
      { href: '/account', label: f.account },
      { href: '/signup', label: f.register },
    ],
  },
];

export function SiteFooter() {
  const { mode, profile } = useAuth();
  const f = useT().footer;
  // With login on, Impact (resource recovery) is for admins only.
  const pathname = usePathname() || '/';
  // Sign-in, registration and the pending screen stay focused: no site links.
  if (['/login', '/signup', '/pending'].some((p) => pathname.startsWith(p))) return null;
  const hideImpact = mode === 'jwt' && profile?.role !== 'admin';
  const columns = columnsFor(f).map((c) => ({ ...c, links: c.links.filter((l) => !(hideImpact && l.href === '/impact')) }));
  return (
    <footer className="border-t border-graphite/10 bg-cream">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-12">
        <div className="space-y-4 md:col-span-5">
          <Wordmark />
        </div>
        <nav aria-label={f.label} className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          {columns.map((col) => (
            <div key={col.title} className="space-y-3">
              <p className="t-label">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-graphite/80 transition-colors hover:text-copper-700">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-graphite/10">
        <div className="page-shell flex flex-col gap-2 py-5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>MEGURI &copy; 2026</p>
          <p>{f.demoNote}</p>
        </div>
      </div>
    </footer>
  );
}
