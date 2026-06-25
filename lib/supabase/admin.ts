import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Privileged Supabase client using the secret key. BYPASSES Row Level Security.
 * Use only in trusted server code for admin/support and system tasks — never in
 * response to unauthenticated input without explicit authorization checks.
 */
export function createAdminClient() {
  const serverEnv = getServerEnv();
  return createSupabaseClient<Database>(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
