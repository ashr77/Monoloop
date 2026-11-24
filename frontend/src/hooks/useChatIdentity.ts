'use client';

// Demo identity for the Messages pages: which organization is reading its chats. Remembered per
// browser. (With AUTH_MODE=jwt the backend uses the signed-in user's organization instead.)

import { useCallback, useEffect, useState } from 'react';
import type { Organization } from '@/lib/types';
import { DEMO_ORGANIZATIONS } from '@/lib/constants';
import { useOrganizations } from './useOrganizations';
import { useIdentity } from '@/lib/auth/AuthProvider';

const KEY = 'monoloop.chatOrganization';
const noop = () => undefined;

export function useChatIdentity() {
  const orgsQuery = useOrganizations();
  const organizations = orgsQuery.data ?? (DEMO_ORGANIZATIONS as unknown as Organization[]);
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    try {
      setStored(window.localStorage.getItem(KEY));
    } catch {
      // Storage blocked: fall back to the first organization.
    }
  }, []);

  const identity = useIdentity();
  const organization = organizations.find((o) => o.id === stored) ?? organizations[0] ?? null;
  const setOrganization = useCallback((id: string) => {
    setStored(id);
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // Not persisted; still applies to this page.
    }
  }, []);

  if (identity.locked) {
    // Signed in: the company reads its own chats; there is nothing to switch.
    const own = identity.organization as Organization | null;
    return { organization: own, organizations: own ? [own] : [], setOrganization: noop, locked: true };
  }
  return { organization, organizations, setOrganization, locked: false };
}
