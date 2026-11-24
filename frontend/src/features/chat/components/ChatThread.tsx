'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, MapPin, MessageCircle, Send, ShoppingCart } from 'lucide-react';
import { useConversationThread } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { ListingOrderDialog } from '@/features/supply/components/ListingOrderDialog';
import { Button, EmptyState, ErrorState, Skeleton, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '../types';

interface Props {
  conversationId: string;
  /** Acting organization (demo identity), from ?as= */
  organizationId: string | null;
}

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortName = (name?: string | null) => (name ?? '').replace(' (Buyer Demo)', '');

export function ChatThread({ conversationId, organizationId }: Props) {
  const router = useRouter();
  const { view, messages, query, send } = useConversationThread(conversationId, organizationId);
  const [draft, setDraft] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const composerId = useId();

  // Keep the newest message in view unless the reader scrolled up to read history.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!organizationId) {
    return (
      <Shell>
        <EmptyState
          icon={<MessageCircle className="size-6" aria-hidden />}
          title="No company selected"
          description="Choose who you are on the Messages page first."
          action={
            <Link href="/messages" className="link text-sm">
              Go to Messages
            </Link>
          }
        />
      </Shell>
    );
  }
  if (query.isError && !view) {
    return (
      <Shell>
        <ErrorState
          title="Could not load this chat"
          message={
            <>
              {errorMessage(query.error, 'Could not load this chat.')}{' '}
              <Link href="/messages" className="link">
                Back to messages
              </Link>
            </>
          }
        />
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <div role="status" aria-label="Loading chat" className="space-y-8 pt-10">
          <div className="space-y-3 border-b rule pb-8">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-8 w-80 max-w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-12 w-2/3 max-w-sm" />
            <Skeleton className="ml-auto h-12 w-1/2 max-w-xs" />
            <Skeleton className="h-12 w-3/5 max-w-sm" />
          </div>
          <span className="sr-only">Loading chat…</span>
        </div>
      </Shell>
    );
  }

  const listing = view.listing;
  const canOrder = view.role === 'BUYER' && listing?.status === 'ACTIVE' && listing.available_quantity > 0;

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  };

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <Link
          href="/messages"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition-colors duration-fast hover:text-graphite"
        >
          <ArrowLeft className="size-4" aria-hidden /> All messages
        </Link>
        {/* Demo identity: flip between the two companies in this chat */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label">Viewing as</span>
          <div role="group" aria-label="Viewing as" className="inline-flex gap-0.5 rounded-sm border border-graphite/15 bg-cream-paper p-0.5">
            {[view.buyer, view.supplier].map((org, i) =>
              org ? (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => router.replace(`/messages/${conversationId}?as=${org.id}`)}
                  aria-pressed={org.id === organizationId}
                  className={cn(
                    'h-7 rounded-xs px-2.5 text-xs font-medium transition-colors duration-fast',
                    org.id === organizationId ? 'bg-graphite text-cream' : 'text-slate-600 hover:text-graphite'
                  )}
                >
                  {i === 0 ? 'Buyer' : 'Supplier'}: {shortName(org.name)}
                </button>
              ) : null
            )}
          </div>
        </div>
      </div>

      {/* The listing this chat is about */}
      <header className="flex flex-col gap-6 border-b rule pb-8 pt-8 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="t-eyebrow flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{view.role === 'BUYER' ? 'Chatting with supplier' : 'Chatting with buyer'}</span>
            <span className="text-graphite">{shortName(view.counterpart?.name)}</span>
            {view.counterpart && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {view.counterpart.city}
              </span>
            )}
          </p>
          {listing && (
            <>
              <h1 className="text-heading-md font-medium sm:text-[1.75rem] sm:leading-tight">{listing.material_specification}</h1>
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-mono text-xs">
                  {listing.length_mm} × {listing.width_mm} × {listing.thickness_mm} mm
                </span>
                <Tag>{listing.condition}</Tag>
              </p>
            </>
          )}
        </div>
        {listing && (
          <div className="flex shrink-0 flex-wrap items-end gap-6">
            <dl className="flex gap-6">
              <div>
                <dt className="t-label">Price</dt>
                <dd className="text-lg font-medium tabular-nums text-graphite">
                  BDT {listing.unit_price_bdt.toLocaleString()}
                  <span className="text-sm font-normal text-slate-600"> /pc</span>
                </dd>
              </div>
              <div>
                <dt className="t-label">Available</dt>
                <dd className="text-lg font-medium tabular-nums text-graphite">{listing.available_quantity} pcs</dd>
              </div>
            </dl>
            {view.role === 'BUYER' && (
              <Button
                variant="primary"
                onClick={() => setOrdering(true)}
                disabled={!canOrder}
                title={canOrder ? 'Order from this listing' : 'This listing has no stock available'}
                leading={<ShoppingCart className="size-4" aria-hidden />}
              >
                Place order
              </Button>
            )}
          </div>
        )}
      </header>

      {ordered && (
        <p className="mt-6 flex items-start gap-2 border-l-2 border-moss-600 py-1 pl-4 text-sm text-graphite" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-moss-600" aria-hidden />
          <span>
            Order request sent. The supplier accepts or rejects it on the{' '}
            <Link href={`/exchanges?as=${organizationId}`} className="link">
              Exchanges
            </Link>{' '}
            page.
          </span>
        </p>
      )}

      {/* Thread */}
      <section aria-label="Conversation" className="mt-6 flex flex-col border-b rule">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="h-[55vh] min-h-[20rem] space-y-5 overflow-y-auto py-6 pr-1"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageCircle className="size-6 text-copper-600" aria-hidden />
              <p className="text-base font-medium text-graphite">Start the conversation</p>
              <p className="max-w-sm text-sm text-slate-600">
                {view.role === 'BUYER' ? 'Ask about condition, delivery or cutting before you order.' : 'The buyer has not written yet.'}
              </p>
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} mine={m.sender_organization_id === organizationId} />)
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-2 border-t rule py-4"
        >
          {send.isError && (
            <p className="field-error mt-0" role="alert">
              {errorMessage(send.error, 'Message not sent.')}
            </p>
          )}
          <label htmlFor={composerId} className="sr-only">
            Message
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id={composerId}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
              className="field max-h-40 min-h-[2.75rem] flex-1 resize-none py-2.5 text-[15px]"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="h-11"
              disabled={!draft.trim()}
              busy={send.isPending}
              aria-label="Send message"
              leading={<Send className="size-4" aria-hidden />}
            >
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </form>
      </section>

      {ordering && listing && (
        <ListingOrderDialog
          listing={listing}
          buyerOrganizationId={organizationId}
          onClose={() => setOrdering(false)}
          onOrdered={(quantity) => {
            setOrdered(true);
            // Let the supplier see it in the chat as well.
            send.mutate(`I've placed an order request for ${quantity} pcs. Please review it on the Exchanges page.`);
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">{children}</div>;
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <p
        className={cn(
          'max-w-[80%] whitespace-pre-wrap break-words rounded-md px-4 py-2.5 text-[15px] leading-relaxed',
          mine ? 'rounded-br-xs bg-graphite text-cream' : 'rounded-bl-xs border border-graphite/10 bg-cream-paper text-graphite'
        )}
      >
        {message.body}
      </p>
      <time dateTime={message.created_at} className="mt-1 font-mono text-[11px] tabular-nums text-slate-600">
        {time(message.created_at)}
      </time>
    </div>
  );
}
