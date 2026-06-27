import { apiOk, apiError } from "@/lib/api/response";
import { checkRateLimit, clientIp } from "@/lib/api/rate-limit";
import { loadPublicBySlug } from "@/lib/api/load";
import { characterStats } from "@/lib/character/api-shapes";

export const dynamic = "force-dynamic";

/** Public stats — fuller computed values, still gated to public-safe sections. */
export async function GET(request: Request, { params }: { params: Promise<{ publicSlug: string }> }) {
  const { publicSlug } = await params;
  if (!(await checkRateLimit(`pub:${clientIp(request)}`, 120, 60))) {
    return apiError("rate_limited", "Too many requests — slow down.", 429);
  }
  const loaded = await loadPublicBySlug(publicSlug);
  if (!loaded) return apiError("not_found", "No public character with that slug.", 404);
  return apiOk(characterStats(loaded.vm));
}
