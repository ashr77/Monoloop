// ============================================================================
// MONOLOOP - Supabase Server Client
// TSUNAGU Hackathon 2026
// Server-side database access using Service Role or Anon Key
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let serverClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes('your-project') &&
      !supabaseKey.includes('your-anon-key')
  );
}

export function getSupabaseServerClient(): SupabaseClient | null {
  if (serverClient) return serverClient;

  if (isSupabaseConfigured() && supabaseUrl && supabaseKey) {
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
