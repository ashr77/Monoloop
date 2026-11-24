'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, AlertCircle, Building2, MapPin, MessageCircle, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { useConversationThread } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { ListingOrderDialog } from '@/features/supply/components/ListingOrderDialog';
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

  // Keep the newest message in view unless the reader scrolled up to read history.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!organizationId) {
    return <Notice>Choose who you are on the Messages page first.</Notice>;
  }
  if (query.isError && !view) {
    return (
      <Notice tone="error">
        {errorMessage(query.error, 'Could not load this chat.')}{' '}
        <Link href="/messages" className="font-semibold underline">Back to messages</Link>
      </Notice>
    );
  }
  if (!view) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading chat…
      </div>
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/messages" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> All messages
        </Link>
        {/* Demo identity: flip between the two companies in this chat */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Viewing as</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {[view.buyer, view.supplier].map((org, i) =>
              org ? (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => router.replace(`/messages/${conversationId}?as=${org.id}`)}
                  aria-pressed={org.id === organizationId}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    org.id === organizationId ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {i === 0 ? 'Buyer' : 'Supplier'}: {shortName(org.name)}
                </button>
              ) : null
            )}
          </div>
        </div>
      </div>

      {/* The listing this chat is about */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-500 flex flex-wrap items-center gap-1.5">
            <Building2 className="w-4 h-4" />
            {view.role === 'BUYER' ? 'Chatting with supplier' : 'Chatting with buyer'}
            <span className="font-bold text-slate-900">{shortName(view.counterpart?.name)}</span>
            {view.counterpart && (
              <span className="flex items-center gap-1 text-slate-400">
                <MapPin className="w-3.5 h-3.5" /> {view.counterpart.city}
              </span>
            )}
          </p>
          {listing && (
            <h1 className="text-xl font-extrabold text-slate-900 mt-1">
              {listing.material_specification}
              <span className="font-medium text-slate-500">
                {' '}· {listing.length_mm} × {listing.width_mm} × {listing.thickness_mm} mm · {listing.condition}
              </span>
            </h1>
          )}
        </div>
        {listing && (
          <div className="flex items-center gap-6 shrink-0">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Price</p>
              <p className="text-lg font-extrabold text-slate-900">
                BDT {listing.unit_price_bdt.toLocaleString()}
                <span className="text-sm font-medium text-slate-400"> /pc</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Available</p>
              <p className="text-lg font-extrabold text-emerald-700">{listing.available_quantity} pcs</p>
            </div>
            {view.role === 'BUYER' && (
              <button
                type="button"
                onClick={() => setOrdering(true)}
                disabled={!canOrder}
                title={canOrder ? 'Order from this listing' : 'This listing has no stock available'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-4 h-4" /> Place order
              </button>
            )}
          </div>
        )}
      </div>

      {ordered && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2" role="status">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          Order request sent. The supplier accepts or rejects it on the{' '}
          <Link href={`/exchanges?as=${organizationId}`} className="font-semibold underline">Exchanges</Link> page.
        </p>
      )}

      {/* Thread */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="h-[55vh] min-h-[20rem] overflow-y-auto px-4 sm:px-6 py-5 space-y-4"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 gap-2">
              <MessageCircle className="w-8 h-8 text-slate-300" />
              <p className="text-base font-semibold text-slate-700">Start the conversation</p>
              <p className="text-sm max-w-sm">
                {view.role === 'BUYER'
                  ? 'Ask about condition, delivery or cutting before you order.'
                  : 'The buyer has not written yet.'}
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
          className="border-t border-slate-200 p-4 space-y-2"
        >
          {send.isError && (
            <p className="text-sm text-red-700 flex items-start gap-1.5" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {errorMessage(send.error, 'Message not sent.')}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
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
              aria-label="Message"
              className="flex-1 resize-none px-4 py-3 rounded-xl border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-40"
            />
            <button
              type="submit"
              disabled={!draft.trim() || send.isPending}
              aria-label="Send message"
              className="shrink-0 p-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
            >
              {send.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </form>
      </div>

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
    </div>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <p
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-base ${
          mine ? 'bg-emerald-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-900 rounded-bl-md'
        }`}
      >
        {message.body}
      </p>
      <span className="text-xs text-slate-400 mt-1">{time(message.created_at)}</span>
    </div>
  );
}

function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <p
        className={`rounded-xl border p-6 text-center text-sm ${
          tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600'
        }`}
        role={tone === 'error' ? 'alert' : undefined}
      >
        {children}
      </p>
    </div>
  );
}
