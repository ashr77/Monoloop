// ============================================================================
// MONOLOOP - Signed-in session (company accounts, AUTH_MODE=jwt on the backend)
//
// Kept in localStorage so a reload stays signed in. The API client reads it to
// send `Authorization: Bearer …` and the company id; listeners re-render the UI.
// ============================================================================

import type { Organization } from '@/lib/types';

export interface CompanyRecord extends Organization {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  license_number?: string | null;
  contact_email?: string | null;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
}

export interface Profile {
  email: string;
  role: 'admin' | 'company';
  organization: CompanyRecord | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  profile: Profile;
}

const KEY = 'monoloop.session';
type Listener = (s: AuthSession | null) => void;
const listeners = new Set<Listener>();
let cached: AuthSession | null | undefined;

export function getSession(): AuthSession | null {
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function setSession(session: AuthSession | null) {
  cached = session;
  try {
    if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session lives for this tab only.
  }
  listeners.forEach((l) => l(session));
}

export function updateProfile(profile: Profile) {
  const s = getSession();
  if (s) setSession({ ...s, profile });
}

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The company a signed-in account acts for (null for admins or when signed out). */
export function sessionOrganizationId(): string | null {
  return getSession()?.profile.organization?.id ?? null;
}
