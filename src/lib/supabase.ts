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
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
