'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { homeFor, useAuth } from '@/lib/auth/AuthProvider';
import { errorMessage } from '@/lib/api/client';
import { Button } from '@/components/ui';
import { AuthCard, Field, FormError } from '@/features/auth/AuthCard';

function LoginForm() {
  const { mode, login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'demo') {
    return (
      <AuthCard title="Login is off" subtitle="This server runs in demo mode: use the “Acting as” switchers instead.">
        <Link href="/" className="link text-sm">
          Go to the dashboard →
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
      setError(errorMessage(err, 'Could not sign in.'));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="One account per company. Supply surplus and post requirements from the same account."
      footer={
        <>
          New company?{' '}
          <Link href="/signup" className="link">
            Register with your trade licence
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy} leading={<LogIn className="size-4" aria-hidden />} className="w-full">
          Sign in
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
