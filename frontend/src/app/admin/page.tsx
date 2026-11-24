'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { CompanyRecord } from '@/lib/auth/session';
import { AnimatePresence, motion, rowMotion } from '@/components/motion';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Segmented,
  StatusBadge,
  TableSkeleton,
  type SegmentOption,
  type Tone,
} from '@/components/ui';
import { cn } from '@/lib/utils';

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ALL';
const TABS: Tab[] = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL'];
const TAB_OPTIONS: SegmentOption<Tab>[] = TABS.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }));

const STATUS_TONE: Record<CompanyRecord['status'], Tone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'muted',
};

type Decision = 'approve' | 'reject' | 'suspend';

export default function AdminPage() {
  const { mode, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('PENDING');
  // Target of the reason dialog; kept after closing so the exit animation still has content.
  const [asking, setAsking] = useState<{ org: CompanyRecord; decision: Exclude<Decision, 'approve'>; nonce: number } | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'applications', tab],
    queryFn: ({ signal }) => api.admin.applications(tab === 'ALL' ? undefined : tab, signal),
    enabled: mode === 'jwt' && profile?.role === 'admin',
    refetchInterval: 20_000,
  });
  const review = useMutation({
    mutationFn: (v: { id: string; decision: Decision; reason?: string }) => api.admin.review(v.id, v.decision, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  if (mode !== 'jwt') {
    return (
      <div className="page-shell py-16">
        <p className="text-sm text-slate-600">Admin review is available when login is on (AUTH_MODE=jwt).</p>
      </div>
    );
  }

  // Approve goes straight through; reject and suspend first collect a reason shown to the company.
  const decide = (o: CompanyRecord, decision: Decision) => {
    if (decision !== 'approve') {
      review.reset();
      setAsking((a) => ({ org: o, decision, nonce: (a?.nonce ?? 0) + 1 }));
      setReasonOpen(true);
      return;
    }
    review.mutate({ id: o.id, decision });
  };

  const rows = query.data ?? [];
  return (
    <div className="page-shell space-y-8 pb-20">
      <PageHeader
        eyebrow="Super admin"
        title="Company applications"
        description="Verify each trade licence before the company can list surplus or post requirements."
        actions={<span className="text-xs text-slate-600">Signed in as {profile?.email}</span>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <Segmented value={tab} onChange={setTab} options={TAB_OPTIONS} label="Filter applications by status" variant="tabs" />
        </div>
        {query.isSuccess && (
          <p className="font-mono text-xs text-slate-600">
            {rows.length} {rows.length === 1 ? 'application' : 'applications'}
          </p>
        )}
      </div>

      {review.isError && !reasonOpen && <ErrorState title="Decision not saved" message={errorMessage(review.error)} />}

      {query.isPending ? (
        <TableSkeleton rows={4} columns={5} label="Loading applications" />
      ) : query.isError ? (
        <ErrorState title="Could not load applications" message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No ${tab === 'ALL' ? '' : tab.toLowerCase() + ' '}applications`}
          description={tab === 'PENDING' ? 'New company registrations appear here for review.' : 'Choose another status to see other applications.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b rule-strong text-left">
                <th scope="col" className="t-label py-3 pr-4 font-medium">Company</th>
                <th scope="col" className="t-label px-4 py-3 font-medium">Trade licence</th>
                <th scope="col" className="t-label px-4 py-3 font-medium">Contact</th>
                <th scope="col" className="t-label px-4 py-3 font-medium">Status</th>
                <th scope="col" className="t-label py-3 pl-4 text-right font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((o) => {
                  const busy = review.isPending && review.variables?.id === o.id;
                  return (
                    <motion.tr key={o.id} {...rowMotion} className="border-b rule align-top">
                      <td className="py-4 pr-4">
                        <div className="font-medium text-graphite">{o.name}</div>
                        <div className="text-xs text-slate-600">
                          {o.city}
                          {o.address ? ` · ${o.address}` : ''}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-600">Applied {new Date(o.created_at).toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-[14px] text-graphite">{o.license_number}</td>
                      <td className="px-4 py-4 text-slate-700">{o.contact_email}</td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={STATUS_TONE[o.status]}>
                          {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                        </StatusBadge>
                        {o.rejection_reason && <div className="mt-1.5 max-w-xs text-xs text-slate-600">“{o.rejection_reason}”</div>}
                      </td>
                      <td className="whitespace-nowrap py-4 pl-4 text-right">
                        <div className="inline-flex gap-2">
                          {o.status !== 'APPROVED' && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => decide(o, 'approve')}
                              busy={busy && review.variables?.decision === 'approve'}
                              disabled={busy}
                              leading={<Check className="size-3.5" aria-hidden />}
                            >
                              Approve
                            </Button>
                          )}
                          {o.status === 'PENDING' && (
                            <Button size="sm" variant="secondary" onClick={() => decide(o, 'reject')} disabled={busy} leading={<X className="size-3.5" aria-hidden />}>
                              Reject
                            </Button>
                          )}
                          {o.status === 'APPROVED' && (
                            <Button size="sm" variant="secondary" onClick={() => decide(o, 'suspend')} disabled={busy}>
                              Suspend
                            </Button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <ReasonDialog
        key={asking?.nonce ?? 0}
        open={reasonOpen}
        asking={asking}
        busy={review.isPending}
        error={review.isError ? errorMessage(review.error) : null}
        onClose={() => setReasonOpen(false)}
        onSubmit={(reason) => {
          if (!asking) return;
          review.mutate({ id: asking.org.id, decision: asking.decision, reason }, { onSuccess: () => setReasonOpen(false) });
        }}
      />
    </div>
  );
}

/** Collects the reason shown to the company when an application is rejected or an account suspended. */
function ReasonDialog({
  open,
  asking,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  asking: { org: CompanyRecord; decision: 'reject' | 'suspend' } | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const fieldId = useId();
  const formId = useId();
  const verb = asking?.decision === 'suspend' ? 'Suspend' : 'Reject';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setInvalid(true);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      eyebrow={asking?.decision === 'suspend' ? 'Suspend account' : 'Reject application'}
      title={`${verb} ${asking?.org.name ?? ''}`}
      description="The reason is shown to the company."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="danger" busy={busy}>
            {verb}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-3">
        <div>
          <label htmlFor={fieldId} className="field-label">
            Reason
          </label>
          <textarea
            id={fieldId}
            data-autofocus
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (invalid && e.target.value.trim().length >= 3) setInvalid(false);
            }}
            aria-invalid={invalid || undefined}
            aria-describedby={`${fieldId}-note`}
            className={cn('field mt-1.5 resize-y', invalid && 'field-invalid')}
          />
          {invalid ? (
            <span id={`${fieldId}-note`} className="field-error">
              Enter a reason of at least 3 characters.
            </span>
          ) : (
            <span id={`${fieldId}-note`} className="field-hint">
              At least 3 characters.
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-brick-700">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
