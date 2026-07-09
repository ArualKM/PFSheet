import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Database } from "./types";

/**
 * Refreshes the Supabase auth session on every request and gates the
 * authenticated app area. Public routes (marketing, auth, share views, API)
 * stay accessible to anonymous visitors.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    return response;
  }

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() verifies the JWT LOCALLY against the project's cached asymmetric signing key (JWKS is
  // memoized module-globally with a TTL) — zero network per request in steady state, unlike getUser()
  // which round-trips to the Auth server on every call. getClaims() still calls getSession() first, so
  // an expired access token is refreshed via the refresh token (cookies updated through setAll above)
  // exactly as before. `claims` is null when there's no valid session.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/characters") ||
    pathname.startsWith("/campaigns") ||
    pathname.startsWith("/spells") ||
    pathname.startsWith("/settings");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // A signed-in user has no reason to see the auth screens — send them into the app so that
  // returning to /login (or clicking a stale "Log in" link) doesn't look like being logged out.
  // Honour a same-site ?next= deep link so redirected sign-in flows still land where intended.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return response;
}
