'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { homeFor, useAuth } from '@/lib/auth/AuthProvider';
import { api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { updateProfile } from '@/lib/auth/session';
import { Button, FactList, Note, StatusBadge, type Tone } from '@/components/ui';
import { AuthCard, Field, FormError } from '@/features/auth/AuthCard';
import { useT } from '@/lib/i18n/I18nProvider';

export default function PendingPage() {
  const { profile, reloadProfile, logout } = useAuth();
  const t = useT();
  const p = t.pending;
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

  const TONES: Record<typeof org.status, Tone> = { PENDING: 'warning', REJECTED: 'danger', SUSPENDED: 'danger', APPROVED: 'success' };
  const head = { tone: TONES[org.status], ...p[org.status] };

  return (
    <AuthCard title={head.title} subtitle={head.text}>
      <div className="space-y-8">
        <div className="space-y-5 border-y rule py-5">
          <div className="flex items-center justify-between gap-3">
            <span className="t-label">{p.status}</span>
            <StatusBadge tone={head.tone}>
              {head.badge}
            </StatusBadge>
          </div>
          <FactList
            facts={[
              { label: p.company, value: org.name },
              { label: p.licence, value: <span className="font-mono">{org.license_number}</span> },
              { label: t.common.city, value: org.city },
              { label: t.common.email, value: <span className="break-all">{profile?.email}</span> },
            ]}
          />
        </div>

        {org.rejection_reason && (
          <Note tone="danger">
            <strong className="font-medium">{p.reason}</strong> {org.rejection_reason}
          </Note>
        )}

        {head.steps.length > 0 && (
          <section aria-labelledby="next-steps" className="space-y-3">
            <h2 id="next-steps" className="t-label">
              {p.nextSteps}
            </h2>
            <ol className="space-y-2.5">
              {head.steps.map((s, i) => (
                <li key={s} className="flex gap-4 text-sm text-graphite">
                  <span className="pt-px font-mono text-xs text-copper-700">{String(i + 1).padStart(2, '0')}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {org.status === 'REJECTED' && <Resubmit name={org.name} city={org.city} license={org.license_number ?? ''} />}

        <div className="flex flex-wrap gap-2">
          {org.status === 'PENDING' && (
            <Button variant="secondary" onClick={check} busy={checking} leading={<RefreshCw className="size-4" aria-hidden />}>
              {p.checkStatus}
            </Button>
          )}
          <Button variant="ghost" onClick={signOut} leading={<LogOut className="size-4" aria-hidden />}>
            {t.common.signOut}
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}

function Resubmit({ name, city, license }: { name: string; city: string; license: string }) {
  const t = useT();
  const p = t.pending;
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
      setError(errorMessage(err, p.resubmitFailed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t rule pt-6" aria-labelledby="resubmit-heading">
      <h2 id="resubmit-heading" className="text-base font-medium">
        {p.resubmitTitle}
      </h2>
      <Field label={t.common.companyName} value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
      <Field label={t.common.licence} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
      <FormError message={error} />
      <Button type="submit" variant="primary" busy={busy}>
        {p.submitAgain}
      </Button>
    </form>
  );
}
