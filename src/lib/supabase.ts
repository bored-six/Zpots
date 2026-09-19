import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Lazily-created, module-level singleton Supabase client.
 *
 * Env vars are read here, at call time, via literal `process.env.X`
 * property accesses (never `process.env[key]`) -- Next.js only inlines
 * `NEXT_PUBLIC_*` values into the browser bundle when referenced this way.
 * Reading at call time (not module load) is also what lets tests swap env
 * vars between `vi.resetModules()` calls.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.",
    );
  }

  client = createClient(url, anonKey, {
    auth: {
      // persistSession/autoRefreshToken: on -- the auth migration (D1) keeps
      // plain supabase-js client sessions (localStorage-backed, auto
      // refreshed) instead of @supabase/ssr. detectSessionInUrl stays off:
      // nothing in this pass sends the user back with tokens in the URL
      // (email confirmation off, password reset deferred) -- flip it on
      // when the reset-password ticket lands.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}
