import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./types";

let cached: SupabaseClient<Database> | null = null;

/**
 * Cookie-free, session-less Supabase client for reading PUBLIC reference data (the compendium tables,
 * which are public-read under RLS). Because it never touches request cookies/headers it is safe to call
 * inside `unstable_cache`, and it's memoized at module scope so warm invocations reuse one client.
 *
 * Do NOT use this for anything user-scoped — it carries no session, so RLS sees it as anonymous.
 */
export function createPublicClient(): SupabaseClient<Database> {
  if (!cached) {
    cached = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cached;
}
