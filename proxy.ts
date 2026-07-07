import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * The single canonical production host, derived from NEXT_PUBLIC_APP_URL (the same value
 * sitemap/robots/OG already treat as canonical; falls back to www.pfsheet.org). Every other
 * production host — the bare `pfsheet.vercel.app` deployment URL and the git-branch alias —
 * redirects here so there is exactly ONE cookie/auth origin. Auth cookies are host-only, so a
 * session set on www.pfsheet.org is otherwise invisible on pfsheet.vercel.app, which reads as
 * being silently logged out. To change the canonical host, set NEXT_PUBLIC_APP_URL.
 */
const CANONICAL_HOST = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.pfsheet.org").host;

/**
 * Next.js Proxy (formerly Middleware). On the production deployment it first canonicalises the
 * host, then refreshes the Supabase session on every request and gates the authenticated app area.
 * Public routes (marketing, auth, share views, API) stay accessible to anonymous visitors.
 */
export async function proxy(request: NextRequest) {
  // Only canonicalise on the PRODUCTION deployment — preview deployments must keep serving on
  // their own *.vercel.app URL so they can be tested in isolation. /api is left alone so that
  // programmatic clients (which may not follow redirects) aren't surprised by a 308.
  if (process.env.VERCEL_ENV === "production" && !request.nextUrl.pathname.startsWith("/api")) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host && host !== CANONICAL_HOST) {
      const target = new URL(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
        `https://${CANONICAL_HOST}`,
      );
      return NextResponse.redirect(target, 308);
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets, image optimization, and common
     * public files so session refresh stays cheap.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
