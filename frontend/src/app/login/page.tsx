'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { homeFor, useAuth } from '@/lib/auth/AuthProvider';
import { errorMessage } from '@/lib/api/client';
import { Button } from '@/components/ui';
import { AuthCard, Field, FormError } from '@/features/auth/AuthCard';
import { useT } from '@/lib/i18n/I18nProvider';

function LoginForm() {
  const { mode, login } = useAuth();
  const t = useT();
  const a = t.auth;
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'demo') {
    return (
      <AuthCard title={a.loginOffTitle} subtitle={a.loginOffText}>
        <Link href="/" className="link text-sm">
          {t.common.goToDashboard}
        </Link>
      </AuthCard>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const profile = await login(email, password);
      const home = homeFor(profile);
      router.replace(next && home === '/' && next.startsWith('/') && !next.startsWith('//') ? next : home);
    } catch (err) {
      setError(errorMessage(err, a.signInFailed));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={a.signInTitle}
      subtitle={a.signInText}
      footer={
        <>
          {a.newCompany}{' '}
          <Link href="/signup" className="link">
            {a.registerLink}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label={t.common.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label={t.common.password}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy} leading={<LogIn className="size-4" aria-hidden />} className="w-full">
          {t.common.signIn}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
