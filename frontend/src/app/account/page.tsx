'use client';

// ============================================================================
// MONOLOOP - My account (company accounts, AUTH_MODE=jwt)
// Overview of the company, editable details (a new name or licence goes back
// to admin approval) and password change. Admins only see the password part.
// ============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { updateProfile } from '@/lib/auth/session';
import { api } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/client';
import { BANGLADESH_CITIES } from '@/lib/constants';
import { useExchanges, useListings, useRequirements } from '@/hooks';
import { Button, ConfirmDialog, LinkButton, Note, PageHeader, SectionHeading, StatusBadge, type Tone } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Field, FormError } from '@/features/auth/AuthCard';

const STATUS: Record<string, { tone: Tone; label: string }> = {
  APPROVED: { tone: 'success', label: 'Verified company' },
  PENDING: { tone: 'warning', label: 'Pending review' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  SUSPENDED: { tone: 'muted', label: 'Suspended' },
};

export default function AccountPage() {
  const { mode, profile } = useAuth();
  if (mode !== 'jwt') {
    return (
      <div className="page-shell py-16">
        <p className="text-sm text-slate-600">Accounts are available when login is on (AUTH_MODE=jwt).</p>
      </div>
    );
  }
  if (!profile) return null;
  const org = profile.organization;
  const status = org ? STATUS[org.status] ?? { tone: 'neutral' as Tone, label: org.status } : null;

  return (
    <div className="page-shell pb-20">
      <PageHeader
        eyebrow="My account"
        title={<span className="block truncate">{org ? org.name : 'Super admin'}</span>}
        description={profile.email}
        actions={
          status ? (
            <StatusBadge tone={status.tone}>
              {status.label}
            </StatusBadge>
          ) : (
            <LinkButton href="/admin" variant="secondary" size="sm" leading={<ShieldCheck className="size-4" aria-hidden />}>
              Review applications
            </LinkButton>
          )
        }
      >
        {org && <Overview organizationId={org.id} />}
      </PageHeader>

      <div className="divide-y divide-graphite/10">
        {org && <CompanyDetails />}
        <PasswordSection index={org ? '02' : '01'} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- overview

function Overview({ organizationId }: { organizationId: string }) {
  const listings = useListings({ organization_id: organizationId }).data ?? [];
  const requirements = useRequirements({ organization_id: organizationId }, organizationId).data?.items ?? [];
  const exchanges = useExchanges({ organization_id: organizationId }).data ?? [];
  const active = exchanges.filter((e) => e.stage !== 'COMPLETED' && e.stage !== 'CANCELLED');
  const completed = exchanges.filter((e) => e.stage === 'COMPLETED');

  const items = [
    { href: '/supply', label: 'Active listings', value: listings.filter((l) => l.status === 'ACTIVE').length, note: `${listings.length} in total` },
    { href: '/demand', label: 'Open requirements', value: requirements.filter((r) => r.status === 'OPEN').length, note: `${requirements.length} in total` },
    { href: '/exchanges', label: 'Active exchanges', value: active.length, note: 'as buyer or supplier' },
    {
      href: '/exchanges',
      label: 'Completed',
      value: completed.length,
      note: `${completed.filter((e) => e.payment?.status === 'PAID').length} paid online`,
    },
  ];

  return (
    <section aria-label="My activity" className="grid grid-cols-2 border-y rule lg:grid-cols-4">
      {items.map((m, i) => (
        <Link
          key={m.label}
          href={m.href}
          className={cn(
            'group min-w-0 space-y-1 border-graphite/10 px-4 py-4 transition-colors duration-fast hover:bg-sand-50',
            i % 2 === 1 && 'border-l',
            i > 1 && 'border-t lg:border-t-0',
            i === 2 && 'lg:border-l'
          )}
        >
          <span className="t-label flex items-center justify-between gap-2">
            <span className="truncate">{m.label}</span>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-slate-500 transition-transform duration-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
          <span className="block text-2xl font-medium tabular-nums tracking-[-0.03em] text-graphite">{m.value}</span>
          <span className="block truncate text-xs text-slate-600">{m.note}</span>
        </Link>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------- company details

function CompanyDetails() {
  const { profile } = useAuth();
  const router = useRouter();
  const org = profile!.organization!;
  const [form, setForm] = useState({ company_name: org.name, license_number: org.license_number ?? '', city: org.city, address: org.address ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setForm({ company_name: org.name, license_number: org.license_number ?? '', city: org.city, address: org.address ?? '' });
  }, [org.name, org.license_number, org.city, org.address]);

  const identityChanged =
    form.company_name.trim() !== org.name || form.license_number.trim().toLowerCase() !== (org.license_number ?? '').toLowerCase();
  const dirty = identityChanged || form.city !== org.city || form.address.trim() !== (org.address ?? '');

  function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    // A new name or licence number sends the account back to admin approval: confirm first.
    if (identityChanged) {
      setConfirming(true);
      return;
    }
    void persist();
  }

  async function persist() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.auth.updateProfile({
        company_name: form.company_name.trim(),
        license_number: form.license_number.trim(),
        city: form.city,
        address: form.address.trim(),
      });
      updateProfile(result.profile);
      if (result.reapproval_required) router.replace('/pending');
      else setSaved(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not save your details.'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section aria-labelledby="company-details" className="grid gap-8 py-12 lg:grid-cols-12">
      <SectionHeading
        id="company-details"
        index="01"
        title="Company details"
        hint="City and address update immediately. A new name or licence number is re-verified by an admin."
        className="lg:col-span-4"
      />
      <form onSubmit={save} className="space-y-5 lg:col-span-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Company name" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          <Field
            label="Trade licence number"
            required
            value={form.license_number}
            onChange={(e) => setForm({ ...form, license_number: e.target.value })}
          />
          <label className="block">
            <span className="field-label">City</span>
            <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="field mt-1.5">
              {Array.from(new Set([org.city, ...BANGLADESH_CITIES])).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <Field label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <Field label="Login email" value={profile!.email} disabled hint="The login email cannot be changed here." />

        {identityChanged && <Note tone="warning">Saving a new name or licence number pauses trading until an admin approves it again.</Note>}
        <FormError message={error} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="primary" disabled={!dirty} busy={busy}>
            Save changes
          </Button>
          {saved && !dirty && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-moss-700">
              <CheckCircle2 className="size-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void persist()}
        busy={busy}
        title="Send your account back for approval?"
        description="Changing the company name or licence number sends your account back to admin approval. You cannot trade until it is approved again."
        confirmLabel="Save and resubmit"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------- password

function PasswordSection({ index }: { index: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof fieldError = {};
    if (next.length < 8) errs.next = 'At least 8 characters.';
    if (confirm !== next) errs.confirm = 'Passwords do not match.';
    setFieldError(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api.auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WRONG_PASSWORD') setFieldError({ current: err.message });
      else setError(errorMessage(err, 'Could not change the password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="password" className="grid gap-8 py-12 lg:grid-cols-12">
      <SectionHeading id="password" index={index} title="Password" className="lg:col-span-4" />
      <form onSubmit={submit} className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-8" noValidate>
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={fieldError.current}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={fieldError.next}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldError.confirm}
        />
        {error && (
          <div className="sm:col-span-3">
            <FormError message={error} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
          <Button type="submit" variant="ink" disabled={!current || !next} busy={busy}>
            Change password
          </Button>
          {done && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-moss-700">
              <CheckCircle2 className="size-4" aria-hidden /> Password changed
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
