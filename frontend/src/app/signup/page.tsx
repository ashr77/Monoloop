'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { homeFor, useAuth } from '@/lib/auth/AuthProvider';
import { ApiError, errorMessage } from '@/lib/api/client';
import { BANGLADESH_CITIES } from '@/lib/constants';
import { AuthCard, Field, FormError } from '@/features/auth/AuthCard';

const EMPTY = { company_name: '', city: 'Dhaka', address: '', license_number: '', email: '', password: '', confirm: '' };
type Form = typeof EMPTY;

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.company_name.trim().length < 2) e.company_name = 'Enter the registered company name.';
  if (!/^[A-Za-z0-9][A-Za-z0-9/\-. ]{3,39}$/.test(f.license_number.trim()))
    e.license_number = '4–40 characters: letters, numbers, / - . and spaces.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'Enter a valid email.';
  if (f.password.length < 8) e.password = 'At least 8 characters.';
  if (f.confirm !== f.password) e.confirm = 'Passwords do not match.';
  return e;
}

export default function SignupPage() {
  const { mode, signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (mode === 'demo') {
    return (
      <AuthCard title="Registration is off" subtitle="This server runs in demo mode with sample companies.">
        <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
          Go to the dashboard →
        </Link>
      </AuthCard>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await signup({
        company_name: form.company_name.trim(),
        city: form.city,
        address: form.address.trim() || undefined,
        license_number: form.license_number.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      router.replace(homeFor(profile));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
      else if (err instanceof ApiError && err.code === 'LICENSE_TAKEN') setErrors({ license_number: err.message });
      else setError(errorMessage(err, 'Registration failed.'));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Register your company"
      subtitle="One account per company: list surplus and post requirements from it. An admin verifies your trade licence before you can trade."
      footer={
        <>
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Company name" required value={form.company_name} onChange={set('company_name')} error={errors.company_name} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">City</span>
            <select
              value={form.city}
              onChange={set('city')}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {BANGLADESH_CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <Field
            label="Trade licence number"
            required
            value={form.license_number}
            onChange={set('license_number')}
            error={errors.license_number}
            hint="Checked by the MONOLOOP admin."
          />
        </div>
        <Field label="Address (optional)" value={form.address} onChange={set('address')} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
          />
        </div>
        <FormError message={error} />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          Submit for approval
        </button>
      </form>
    </AuthCard>
  );
}
