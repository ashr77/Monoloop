// ============================================================================
// MONOLOOP - Supabase Browser Client
// TSUNAGU Hackathon 2026
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;

  if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')) {
    client = createClient(supabaseUrl, supabaseAnonKey);
    return client;
  }

  return null;
}
