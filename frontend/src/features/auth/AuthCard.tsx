// Shared frame and fields for the sign-in / sign-up pages.

import type { InputHTMLAttributes, ReactNode } from 'react';

export function AuthCard({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          MONOLOOP company account
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
    </div>
  );
}

export function Field({ label, hint, error, ...input }: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        {...input}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-emerald-200 ${
          error ? 'border-red-400' : 'border-slate-300 focus:border-emerald-500'
        }`}
      />
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}
