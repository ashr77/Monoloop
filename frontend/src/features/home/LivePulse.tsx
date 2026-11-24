'use client';

// Live network figures straight from the API (no estimates, no placeholders).
import { useListings, useMatchesOverview } from '@/hooks';
import { Skeleton } from '@/components/ui';
import { num } from '@/features/exchanges/components/format';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n/I18nProvider';

export function LivePulse() {
  const h = useT().home;
  const identity = useIdentity();
  // Signed-in companies only receive their own requirements from the API.
  const own = identity.locked && !identity.isAdmin;
  const listings = useListings({ status: 'ACTIVE' });
  const overview = useMatchesOverview();

  const active = (listings.data ?? []).filter((l) => l.status === 'ACTIVE');
  const pieces = active.reduce((s, l) => s + l.available_quantity, 0);
  const rows = overview.data ?? [];
  const fulfillable = rows.filter((r) => r.result.unfulfilled_quantity === 0 && r.result.allocations.length > 0).length;

  const items: { label: string; value: string | null; loading: boolean; failed: boolean }[] = [
    { label: h.activeListings, value: num(active.length), loading: listings.isPending, failed: listings.isError },
    { label: h.piecesAvailable, value: num(pieces), loading: listings.isPending, failed: listings.isError },
    { label: own ? h.yourOpenRequirements : h.openRequirements, value: num(rows.length), loading: overview.isPending, failed: overview.isError },
    { label: own ? h.yoursFulfillable : h.fulfillable, value: num(fulfillable), loading: overview.isPending, failed: overview.isError },
  ];
  const allFailed = listings.isError && overview.isError;

  return (
    <section aria-label={h.liveFigures} className="border-y border-graphite/10">
      <div className="page-shell flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:gap-10">
        {allFailed ? (
          <p className="text-sm text-slate-600">{h.liveUnavailable}</p>
        ) : (
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {items.map((it) => (
              <div key={it.label} className="min-w-0">
                <dt className="truncate text-xs text-slate-600">{it.label}</dt>
                <dd className="mt-0.5 text-xl font-medium tabular-nums tracking-[-0.02em] text-graphite">
                  {it.loading ? <Skeleton className="mt-1 h-5 w-12" /> : it.failed ? <span className="text-slate-400">—</span> : it.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
