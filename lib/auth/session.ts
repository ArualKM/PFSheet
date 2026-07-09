import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email?: string;
  displayName?: string;
};

/**
 * Returns the signed-in user, or null. Safe to call in any server context.
 * Wrapped in React `cache()` so multiple calls within a single request (e.g. the marketing
 * layout header + the page body) share one Supabase lookup instead of round-tripping twice.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  // getClaims() verifies the JWT locally via the cached asymmetric signing key (no network round-trip
  // to the Auth server, unlike getUser()); id/email/display_name all live in the token claims. It still
  // refreshes an expired session under the hood, so cookie rotation is preserved. cache() keeps this
  // memoized per render so the layout + page share one call.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const displayName = claims.user_metadata?.display_name;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    displayName: typeof displayName === "string" ? displayName : undefined,
  };
});

/** Returns the signed-in user or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
