import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * §14.5 fixed-window rate limit, backed by the check_rate_limit RPC. Fail-OPEN: if
 * the limiter itself errors we allow the request rather than break the API (the
 * limiter is a safety valve, not the authorization boundary).
 */
export async function checkRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

/**
 * Best-effort client IP for anonymous rate-limit buckets. Prefer the platform-set
 * `x-real-ip` (trustworthy on Vercel); the leftmost `x-forwarded-for` token is
 * client-spoofable, so it's only a last-resort fallback for other environments.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}
