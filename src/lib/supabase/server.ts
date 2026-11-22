// ============================================================================
// MONOLOOP - Supabase Server Client
// TSUNAGU Hackathon 2026
// Server-side database access using Service Role or Anon Key
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serverClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes('your-project') &&
      !supabaseKey.includes('your-anon-key') &&
      !supabaseKey.includes('your-service-role')
  );
}

export function getSupabaseServerClient(): SupabaseClient | null {
  if (serverClient) return serverClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isSupabaseConfigured() && supabaseUrl && supabaseKey) {
    // Avoid Node.js < 22 WebSocket warning/exception on server operations
    if (typeof globalThis.WebSocket === 'undefined') {
      globalThis.WebSocket = class DummyWebSocket {} as unknown as typeof WebSocket;
    }

    serverClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return serverClient;
  }

  return null;
}
