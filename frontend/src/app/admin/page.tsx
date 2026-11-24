'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { CompanyRecord } from '@/lib/auth/session';

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ALL';
const TABS: Tab[] = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL'];

const STATUS_STYLE: Record<CompanyRecord['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-800 border-red-200',
  SUSPENDED: 'bg-slate-100 text-slate-700 border-slate-300',
};

export default function AdminPage() {
  const { mode, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('PENDING');
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'applications', tab],
    queryFn: ({ signal }) => api.admin.applications(tab === 'ALL' ? undefined : tab, signal),
    enabled: mode === 'jwt' && profile?.role === 'admin',
    refetchInterval: 20_000,
  });
  const review = useMutation({
    mutationFn: (v: { id: string; decision: 'approve' | 'reject' | 'suspend'; reason?: string }) =>
      api.admin.review(v.id, v.decision, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  if (mode !== 'jwt') {
    return <p className="mx-auto max-w-3xl px-4 py-16 text-sm text-slate-600">Admin review is available when login is on (AUTH_MODE=jwt).</p>;
  }

  const decide = (o: CompanyRecord, decision: 'approve' | 'reject' | 'suspend') => {
    let reason: string | undefined;
    if (decision !== 'approve') {
      reason = window.prompt(`${decision === 'reject' ? 'Reject' : 'Suspend'} ${o.name}: reason shown to the company`)?.trim();
      if (!reason || reason.length < 3) return;
    }
    review.mutate({ id: o.id, decision, reason });
  };

  const rows = query.data ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" /> Super admin
          </span>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Company applications</h1>
          <p className="mt-1 text-sm text-slate-500">Verify each trade licence before the company can list surplus or post requirements.</p>
        </div>
        <span className="text-xs text-slate-500">Signed in as {profile?.email}</span>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              tab === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {review.isError && (
        <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" /> {errorMessage(review.error)}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {query.isPending ? (
          <p className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading applications…
          </p>
        ) : query.isError ? (
          <p className="p-10 text-center text-sm text-red-700">{errorMessage(query.error)}</p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">No {tab === 'ALL' ? '' : tab.toLowerCase() + ' '}applications.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Trade licence</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const busy = review.isPending && review.variables?.id === o.id;
                return (
                  <tr key={o.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{o.name}</div>
                      <div className="text-xs text-slate-500">
                        {o.city}
                        {o.address ? ` · ${o.address}` : ''}
                      </div>
                      <div className="text-xs text-slate-400">Applied {new Date(o.created_at).toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-800">{o.license_number}</td>
                    <td className="px-4 py-3 text-slate-700">{o.contact_email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[o.status]}`}>{o.status}</span>
                      {o.rejection_reason && <div className="mt-1 max-w-xs text-xs text-slate-500">“{o.rejection_reason}”</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {o.status !== 'APPROVED' && (
                          <button
                            onClick={() => decide(o, 'approve')}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                          </button>
                        )}
                        {o.status === 'PENDING' && (
                          <button
                            onClick={() => decide(o, 'reject')}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </button>
                        )}
                        {o.status === 'APPROVED' && (
                          <button
                            onClick={() => decide(o, 'suspend')}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
