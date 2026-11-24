'use client';

import Link from 'next/link';
import { MessageCircle, Building2, Loader2, Inbox } from 'lucide-react';
import { useChatIdentity, useInbox } from '@/hooks';
import { errorMessage } from '@/lib/api/client';

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortName = (name?: string | null) => (name ?? '').replace(' (Buyer Demo)', '');

export function InboxView() {
  const { organization, organizations, setOrganization } = useChatIdentity();
  const inbox = useInbox(organization?.id ?? null);
  const items = inbox.data?.items ?? [];
  const isSupplier = organization?.organization_type === 'SUPPLIER';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <MessageCircle className="w-3.5 h-3.5" /> Buyer ↔ supplier chat
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">Messages</h1>
          <p className="text-sm text-slate-500 mt-1">Conversations about surplus listings. Start one from the Supply page.</p>
        </div>
        <label className="flex items-center gap-2 bg-slate-100 p-1.5 pl-3 rounded-xl border border-slate-200">
          <Building2 className="w-4 h-4 text-slate-500" aria-hidden />
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Signed in as</span>
          <select
            value={organization?.id ?? ''}
            onChange={(e) => setOrganization(e.target.value)}
            className="bg-white rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[18rem]"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {shortName(o.name)} · {o.organization_type === 'SUPPLIER' ? 'Supplier' : 'Buyer'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {inbox.isError ? (
          <p className="p-8 text-center text-sm text-red-700" role="alert">{errorMessage(inbox.error, 'Could not load messages.')}</p>
        ) : inbox.isPending ? (
          <p className="p-10 text-center text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading messages…
          </p>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-700">No conversations yet</p>
            <p className="text-sm text-slate-500 mt-1">
              {isSupplier
                ? 'When a buyer starts a chat about one of your listings, it appears here.'
                : 'On the Supply page, choose “Order as buyer…” and press Chat on a listing.'}
            </p>
            <Link href="/supply" className="inline-block mt-4 text-sm font-semibold text-emerald-700 hover:underline">Go to Supply →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}?as=${organization?.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 focus:outline-none focus:bg-emerald-50/60"
                >
                  <div className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center font-bold text-white ${
                    c.role === 'BUYER' ? 'bg-sky-600' : 'bg-emerald-600'}`} aria-hidden>
                    {shortName(c.counterpart?.name).charAt(0) || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate text-base ${c.unread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>
                        {shortName(c.counterpart?.name) || 'Unknown'}
                      </p>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.role === 'BUYER' ? 'bg-sky-50 text-sky-800' : 'bg-emerald-50 text-emerald-800'}`}>
                        {c.role === 'BUYER' ? 'Supplier' : 'Buyer'}
                      </span>
                    </div>
                    {c.listing && (
                      <p className="text-sm text-slate-500 truncate">
                        {c.listing.material_specification} · {c.listing.length_mm} × {c.listing.width_mm} × {c.listing.thickness_mm} mm
                      </p>
                    )}
                    <p className={`text-sm truncate ${c.unread ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                      {c.last_message_preview || 'No messages yet'}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className="text-xs text-slate-400">{time(c.last_message_at)}</span>
                    {c.unread > 0 && (
                      <span className="min-w-[1.5rem] px-1.5 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold text-center"
                        aria-label={`${c.unread} unread`}>
                        {c.unread}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
