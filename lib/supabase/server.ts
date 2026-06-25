import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getServerEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Server-side Supabase client bound to the request cookies. Runs as the signed-in
 * user (RLS applies). Use in Server Components, Route Handlers, and Server Actions.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const serverEnv = getServerEnv();

  return createServerClient<Database>(serverEnv.supabaseUrl, serverEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll can be called from a Server Component where mutation is not
          // allowed. The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
