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

  const heads: Record<typeof org.status, { tone: Tone; badge: string; title: string; text: string; steps: string[] }> = {
    PENDING: {
      tone: 'warning',
      badge: 'Pending review',
      title: 'Waiting for approval',
      text: 'A Meguri admin is verifying your trade licence. You can trade as soon as it is approved.',
      steps: [
        'An admin checks your company name and trade licence number.',
        'This page checks for a decision every 20 seconds, or press Check status.',
        'Once approved you are taken straight to your dashboard.',
      ],
    },
    REJECTED: {
      tone: 'danger',
      badge: 'Rejected',
      title: 'Application rejected',
      text: 'Correct the details below and submit again.',
      steps: [
        'Read the reason given by the admin.',
        'Correct the company name or licence number below and submit again.',
        'Your application returns to the admin for review.',
      ],
    },
    SUSPENDED: {
      tone: 'danger',
      badge: 'Suspended',
      title: 'Account suspended',
      text: 'Contact the Meguri admin to restore access.',
      steps: ['Contact the Meguri admin, quoting your company name and licence number.', 'Trading resumes once the admin restores access.'],
    },
    APPROVED: { tone: 'success', badge: 'Approved', title: '', text: '', steps: [] },
  };
  const head = heads[org.status];

  return (
    <AuthCard title={head.title} subtitle={head.text}>
      <div className="space-y-8">
        <div className="space-y-5 border-y rule py-5">
          <div className="flex items-center justify-between gap-3">
            <span className="t-label">Application status</span>
            <StatusBadge tone={head.tone}>
              {head.badge}
            </StatusBadge>
          </div>
          <FactList
            facts={[
              { label: 'Company', value: org.name },
              { label: 'Licence', value: <span className="font-mono">{org.license_number}</span> },
              { label: 'City', value: org.city },
              { label: 'Email', value: <span className="break-all">{profile?.email}</span> },
            ]}
          />
        </div>

        {org.rejection_reason && (
          <Note tone="danger">
            <strong className="font-medium">Reason:</strong> {org.rejection_reason}
          </Note>
        )}

        {head.steps.length > 0 && (
          <section aria-labelledby="next-steps" className="space-y-3">
            <h2 id="next-steps" className="t-label">
              Next steps
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
              Check status
            </Button>
          )}
          <Button variant="ghost" onClick={signOut} leading={<LogOut className="size-4" aria-hidden />}>
            Sign out
          </Button>
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
    <form onSubmit={submit} className="space-y-4 border-t rule pt-6" aria-labelledby="resubmit-heading">
      <h2 id="resubmit-heading" className="text-base font-medium">
        Correct and resubmit
      </h2>
      <Field label="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
      <Field label="Trade licence number" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
      <FormError message={error} />
      <Button type="submit" variant="primary" busy={busy}>
        Submit again
      </Button>
    </form>
  );
}
