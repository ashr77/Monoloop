'use client';

// ============================================================================
// MONOLOOP - Company accounts in the UI
//
// The backend decides the mode (GET /api/health → auth_mode):
//   demo : no login, the "Acting as" switchers work as before.
//   jwt  : companies sign in; one account = one company, locked as the acting
//          identity everywhere. Pending/rejected companies only see /pending,
//          admins review applications on /admin.
// ============================================================================

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { api, type SignupInput } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import {
  getSession,
  onSessionChange,
  setSession,
  updateProfile,
  type AuthSession,
  type CompanyRecord,
  type Profile,
} from './session';

type Mode = 'loading' | 'demo' | 'jwt';

interface AuthContextValue {
  mode: Mode;
  session: AuthSession | null;
  profile: Profile | null;
  login: (email: string, password: string) => Promise<Profile>;
  signup: (input: SignupInput) => Promise<Profile>;
  logout: () => void;
  reloadProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [session, setSessionState] = useState<AuthSession | null>(null);

  useEffect(() => {
    setSessionState(getSession());
    return onSessionChange(setSessionState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The backend decides the mode. Retry a few times (cold starts, flaky networks) and never
      // drop a signed-in user into demo mode just because the backend was slow to answer.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const h = await api.health.get();
          if (!cancelled) setMode(h.auth_mode === 'jwt' ? 'jwt' : 'demo');
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!cancelled) setMode(getSession() ? 'jwt' : 'demo'); // unreachable: pages show their own errors
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!getSession()) return null;
    try {
      const profile = await api.auth.me();
      updateProfile(profile);
      return profile;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setSession(null);
      return null;
    }
  }, []);

  // Pick up approval/rejection made by the admin since the last visit.
  useEffect(() => {
    if (mode === 'jwt') void reloadProfile();
  }, [mode, reloadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      session,
      profile: session?.profile ?? null,
      login: async (email, password) => {
        const s = await api.auth.login(email, password);
        setSession(s);
        return s.profile;
      },
      signup: async (input) => {
        const s = await api.auth.signup(input);
        setSession(s);
        return s.profile;
      },
      logout: () => setSession(null),
      reloadProfile,
    }),
    [mode, session, reloadProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      <AuthGate>{children}</AuthGate>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Who the UI acts as. `locked` = a signed-in company: pages must use `organizationId`
 * and hide their "Acting as" switchers. In demo mode pages keep their own switchers.
 */
export function useIdentity() {
  const { mode, profile } = useAuth();
  const organization: CompanyRecord | null = profile?.organization ?? null;
  return {
    mode,
    locked: mode === 'jwt',
    isAdmin: profile?.role === 'admin',
    organizationId: organization?.id ?? null,
    organization,
  };
}

// ---------------------------------------------------------------------------- route guard

const PUBLIC_PATHS = ['/login', '/signup'];

export function homeFor(profile: Profile | null): string {
  if (!profile) return '/login';
  if (profile.role === 'admin') return '/admin';
  return profile.organization?.status === 'APPROVED' ? '/' : '/pending';
}

function allowed(path: string, profile: Profile | null): boolean {
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return true;
  if (!profile) return false;
  if (path.startsWith('/admin')) return profile.role === 'admin';
  if (profile.role === 'admin') return true; // admins may browse (read-only: the API blocks trading)
  const approved = profile.organization?.status === 'APPROVED';
  return path.startsWith('/pending') ? !approved : approved;
}

function AuthGate({ children }: { children: ReactNode }) {
  const { mode, profile } = useAuth();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const ok = mode !== 'jwt' || allowed(pathname, profile);

  useEffect(() => {
    if (mode !== 'jwt' || ok) return;
    const target = homeFor(profile);
    const next = !profile && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(target + next);
  }, [mode, ok, profile, pathname, router]);

  if (mode === 'loading' || !ok) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center" role="status">
        <span className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.08em] text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-copper" aria-hidden /> Loading
        </span>
        {mode === 'loading' && <span className="max-w-xs text-sm text-slate-600">Waking up the server, this can take up to a minute.</span>}
      </div>
    );
  }
  return <>{children}</>;
}
