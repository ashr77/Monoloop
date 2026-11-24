'use client';

// ============================================================================
// MONOLOOP - My account (company accounts, AUTH_MODE=jwt)
// Overview of the company, editable details (a new name or licence goes back
// to admin approval) and password change. Admins only see the password part.
// ============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, FileText, KeyRound, Loader2, Package, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { updateProfile } from '@/lib/auth/session';
import { api } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/client';
import { BANGLADESH_CITIES } from '@/lib/constants';
import { useExchanges, useListings, useRequirements } from '@/hooks';
import { Field, FormError } from '@/features/auth/AuthCard';

const STATUS_STYLE: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  REJECTED: 'bg-red-50 text-red-800 border-red-200',
  SUSPENDED: 'bg-slate-100 text-slate-700 border-slate-300',
};

export default function AccountPage() {
  const { mode, profile } = useAuth();
  if (mode !== 'jwt') {
    return <p className="mx-auto max-w-3xl px-4 py-16 text-sm text-slate-600">Accounts are available when login is on (AUTH_MODE=jwt).</p>;
  }
  if (!profile) return null;
  const org = profile.organization;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">My account</span>
          <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-slate-900">
            {org ? org.name : 'Super admin'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{profile.email}</p>
        </div>
        {org ? (
          <span className={`self-start rounded-full border px-3 py-1 text-xs font-semibold sm:self-center ${STATUS_STYLE[org.status]}`}>
            {org.status === 'APPROVED' ? 'Verified company' : org.status}
          </span>
        ) : (
          <Link href="/admin" className="inline-flex items-center gap-1 self-start text-sm font-semibold text-emerald-700 hover:underline">
            <ShieldCheck className="h-4 w-4" /> Review applications →
          </Link>
        )}
      </header>

      {org && <Overview organizationId={org.id} />}
      {org && <CompanyDetails />}
      <PasswordSection />
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

  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="My activity">
      <Card href="/supply" icon={<Package className="h-4 w-4 text-emerald-600" />} label="Active listings"
        value={listings.filter((l) => l.status === 'ACTIVE').length} note={`${listings.length} in total`} />
      <Card href="/demand" icon={<FileText className="h-4 w-4 text-emerald-600" />} label="Open requirements"
        value={requirements.filter((r) => r.status === 'OPEN').length} note={`${requirements.length} in total`} />
      <Card href="/exchanges" icon={<ArrowLeftRight className="h-4 w-4 text-emerald-600" />} label="Active exchanges"
        value={active.length} note="as buyer or supplier" />
      <Card href="/exchanges" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Completed"
        value={completed.length} note={`${completed.filter((e) => e.payment?.status === 'PAID').length} paid online`} />
    </section>
  );
}

function Card({ href, icon, label, value, note }: { href: string; icon: ReactNode; label: string; value: number; note: string }) {
  return (
    <Link href={href} className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label} {icon}
      </div>
      <div className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </Link>
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

  useEffect(() => {
    setForm({ company_name: org.name, license_number: org.license_number ?? '', city: org.city, address: org.address ?? '' });
  }, [org.name, org.license_number, org.city, org.address]);

  const identityChanged =
    form.company_name.trim() !== org.name || form.license_number.trim().toLowerCase() !== (org.license_number ?? '').toLowerCase();
  const dirty = identityChanged || form.city !== org.city || form.address.trim() !== (org.address ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (identityChanged &&
        !window.confirm('Changing the company name or licence number sends your account back to admin approval. You cannot trade until it is approved again. Continue?')) {
      return;
    }
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
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Company details</h2>
      <p className="mt-1 text-sm text-slate-500">City and address update immediately. A new name or licence number is re-verified by an admin.</p>
      <form onSubmit={save} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company name" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          <Field label="Trade licence number" required value={form.license_number}
            onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">City</span>
            <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200">
              {Array.from(new Set([org.city, ...BANGLADESH_CITIES])).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <Field label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <Field label="Login email" value={profile!.email} disabled hint="The login email cannot be changed here." />

        {identityChanged && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Saving a new name or licence number pauses trading until an admin approves it again.
          </p>
        )}
        <FormError message={error} />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={!dirty || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
          </button>
          {saved && !dirty && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------- password

function PasswordSection() {
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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><KeyRound className="h-5 w-5 text-slate-500" /> Password</h2>
      <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3" noValidate>
        <Field label="Current password" type="password" autoComplete="current-password" required value={current}
          onChange={(e) => setCurrent(e.target.value)} error={fieldError.current} />
        <Field label="New password" type="password" autoComplete="new-password" required value={next}
          onChange={(e) => setNext(e.target.value)} error={fieldError.next} />
        <Field label="Confirm new password" type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} error={fieldError.confirm} />
        <div className="flex items-center gap-3 sm:col-span-3">
          <button type="submit" disabled={busy || !current || !next}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Change password
          </button>
          {done && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Password changed</span>}
        </div>
        <div className="sm:col-span-3"><FormError message={error} /></div>
      </form>
    </section>
  );
}
