'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Clock, Loader2, LogOut, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { homeFor, useAuth } from '@/lib/auth/AuthProvider';
import { api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { updateProfile } from '@/lib/auth/session';
import { AuthCard, Field, FormError } from '@/features/auth/AuthCard';

export default function PendingPage() {
  const { profile, reloadProfile, logout } = useAuth();
  const router = useRouter();
  const org = profile?.organization;
  const [checking, setChecking] = useState(false);

  // Poll for the admin's decision; approved companies go straight to the dashboard.
  useEffect(() => {
    const t = setInterval(() => void reloadProfile(), 20_000);
    return () => clearInterval(t);
  }, [reloadProfile]);
  useEffect(() => {
    if (org?.status === 'APPROVED') router.replace(homeFor(profile));
  }, [org?.status, profile, router]);

  if (!org) return null;

  const check = async () => {
    setChecking(true);
    await reloadProfile();
    setChecking(false);
  };
  const signOut = () => {
    logout();
    router.replace('/login');
  };

  const head = {
    PENDING: { icon: <Clock className="h-6 w-6 text-amber-600" />, title: 'Waiting for approval',
      text: 'A MONOLOOP admin is verifying your trade licence. You can trade as soon as it is approved.' },
    REJECTED: { icon: <XCircle className="h-6 w-6 text-red-600" />, title: 'Application rejected',
      text: 'Correct the details below and submit again.' },
    SUSPENDED: { icon: <ShieldAlert className="h-6 w-6 text-red-600" />, title: 'Account suspended',
      text: 'Contact the MONOLOOP admin to restore access.' },
    APPROVED: { icon: null, title: '', text: '' },
  }[org.status];

  return (
    <AuthCard title={head.title} subtitle={head.text}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {head.icon}
          <dl className="grid flex-1 grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">Company</dt>
            <dd className="font-semibold text-slate-900">{org.name}</dd>
            <dt className="text-slate-500">Licence</dt>
            <dd className="font-mono text-slate-800">{org.license_number}</dd>
            <dt className="text-slate-500">City</dt>
            <dd className="text-slate-800">{org.city}</dd>
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-800">{profile?.email}</dd>
          </dl>
        </div>

        {org.rejection_reason && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong>Reason:</strong> {org.rejection_reason}
          </p>
        )}

        {org.status === 'REJECTED' && <Resubmit name={org.name} city={org.city} license={org.license_number ?? ''} />}

        <div className="flex flex-wrap gap-2">
          {org.status === 'PENDING' && (
            <button
              onClick={check}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Check status
            </button>
          )}
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </AuthCard>
  );
}

function Resubmit({ name, city, license }: { name: string; city: string; license: string }) {
  const [companyName, setCompanyName] = useState(name);
  const [licenseNumber, setLicenseNumber] = useState(license);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      updateProfile(await api.auth.resubmit({ company_name: companyName.trim(), city, license_number: licenseNumber.trim() }));
    } catch (err) {
      setError(errorMessage(err, 'Could not resubmit.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <Field label="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
      <Field label="Trade licence number" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
      <FormError message={error} />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Submit again
      </button>
    </form>
  );
}
