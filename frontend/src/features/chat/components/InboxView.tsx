'use client';

import Link from 'next/link';
import { Building2, Inbox } from 'lucide-react';
import { useChatIdentity, useInbox } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { AnimatePresence, motion, rowMotion } from '@/components/motion';
import { EmptyState, ErrorState, LinkButton, PageHeader, Skeleton, StatusBadge, Tag, ToolbarSelect } from '@/components/ui';
import { cn } from '@/lib/utils';

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortName = (name?: string | null) => (name ?? '').replace(' (Buyer Demo)', '');

export function InboxView() {
  const { organization, organizations, setOrganization, locked } = useChatIdentity();
  const inbox = useInbox(organization?.id ?? null);
  const items = inbox.data?.items ?? [];
  const isSupplier = organization?.organization_type === 'SUPPLIER';

  return (
    <div className="page-shell space-y-8 pb-20">
      <PageHeader
        eyebrow="Buyer ↔ supplier chat"
        title="Messages"
        description="Conversations about surplus listings. Start one from the Supply page."
        actions={
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <span className="t-label whitespace-nowrap" aria-hidden>
              Signed in as
            </span>
            <ToolbarSelect
              label="Signed in as"
              icon={<Building2 className="size-3.5" />}
              value={organization?.id ?? ''}
              onChange={(e) => setOrganization(e.target.value)}
              className="max-w-[18rem]"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {shortName(o.name)} · {o.organization_type === 'SUPPLIER' ? 'Supplier' : 'Buyer'}
                </option>
              ))}
            </ToolbarSelect>
          </div>
        }
      />

      {inbox.isError ? (
        <ErrorState title="Could not load messages" message={errorMessage(inbox.error, 'Could not load messages.')} onRetry={() => void inbox.refetch()} />
      ) : inbox.isPending ? (
        <InboxSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden />}
          title="No conversations yet"
          description={
            locked
              ? 'Press Chat on any listing in the Supply marketplace. Buyers who chat about your listings appear here too.'
              : isSupplier
              ? 'When a buyer starts a chat about one of your listings, it appears here.'
              : 'On the Supply page, choose “Order as buyer…” and press Chat on a listing.'
          }
          action={
            <LinkButton href="/supply" variant="secondary" size="sm">
              Go to Supply →
            </LinkButton>
          }
        />
      ) : (
        <ul className="divide-y divide-graphite/10 border-y rule" aria-label="Conversations">
          <AnimatePresence initial={false}>
            {items.map((c) => {
              const name = shortName(c.counterpart?.name) || 'Unknown';
              return (
                <motion.li key={c.id} {...rowMotion}>
                  <Link
                    href={`/messages/${c.id}?as=${organization?.id}`}
                    className="group flex items-start gap-4 px-2 py-4 transition-colors duration-fast hover:bg-sand-50 focus-visible:bg-sand-50 sm:px-3"
                  >
                    <span
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-sm text-sm font-medium',
                        c.role === 'BUYER' ? 'bg-graphite text-cream' : 'border border-graphite/15 bg-cream-paper text-graphite'
                      )}
                      aria-hidden
                    >
                      {name.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className={cn('truncate text-[15px] text-graphite', c.unread ? 'font-semibold' : 'font-medium')}>{name}</p>
                        <Tag className="shrink-0">{c.role === 'BUYER' ? 'Supplier' : 'Buyer'}</Tag>
                      </div>
                      {c.listing && (
                        <p className="truncate text-[13px] text-slate-600">
                          {c.listing.material_specification} ·{' '}
                          <span className="font-mono text-xs">
                            {c.listing.length_mm} × {c.listing.width_mm} × {c.listing.thickness_mm} mm
                          </span>
                        </p>
                      )}
                      <p className={cn('truncate text-sm', c.unread ? 'font-medium text-graphite' : 'text-slate-600')}>
                        {c.last_message_preview || 'No messages yet'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <time dateTime={c.last_message_at} className="font-mono text-[11px] tabular-nums text-slate-600">
                        {time(c.last_message_at)}
                      </time>
                      {c.unread > 0 && (
                        <StatusBadge tone="copper" solid>
                          {c.unread} unread
                        </StatusBadge>
                      )}
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div role="status" aria-label="Loading messages" className="divide-y divide-graphite/10 border-y rule">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 px-2 py-4 sm:px-3" style={{ opacity: 1 - i * 0.15 }}>
          <Skeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading messages…</span>
    </div>
  );
}
