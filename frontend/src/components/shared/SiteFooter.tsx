'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Wordmark } from './Wordmark';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Trade',
    links: [
      { href: '/supply?scope=all', label: 'Marketplace' },
      { href: '/supply', label: 'Supplier inventory' },
      { href: '/demand', label: 'Buyer requirements' },
    ],
  },
  {
    title: 'Coordinate',
    links: [
      { href: '/matches', label: 'Matching' },
      { href: '/exchanges', label: 'Exchanges' },
      { href: '/messages', label: 'Messages' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/impact', label: 'Resource recovery' },
      { href: '/account', label: 'My account' },
      { href: '/signup', label: 'Register a company' },
    ],
  },
];

export function SiteFooter() {
  const { mode, profile } = useAuth();
  // With login on, Impact (resource recovery) is for admins only.
  const hideImpact = mode === 'jwt' && profile?.role !== 'admin';
  const columns = COLUMNS.map((c) => ({ ...c, links: c.links.filter((l) => !(hideImpact && l.href === '/impact')) }));
  return (
    <footer className="border-t border-graphite/10 bg-cream">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-12">
        <div className="space-y-4 md:col-span-5">
          <Wordmark />
          <p className="max-w-sm text-sm leading-relaxed text-slate-600">
            Industrial surplus matching and resource exchange. Built for the TSUNAGU Hackathon 2026 &mdash;{' '}
            <span className="text-graphite">Update the Way We Connect.</span>
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
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
          <p>MONOLOOP &copy; 2026</p>
          <p>All registered organizations and listings shown are synthetic demo data.</p>
        </div>
      </div>
    </footer>
  );
}
