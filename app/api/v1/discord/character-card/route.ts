import { apiOk, apiError } from "@/lib/api/response";
import { checkRateLimit, clientIp } from "@/lib/api/rate-limit";
import { loadPublicBySlug } from "@/lib/api/load";
import { guardOwnedCharacter } from "@/lib/api/guard";
import { discordCard } from "@/lib/character/api-shapes";

export const dynamic = "force-dynamic";

/**
 * §13.4 Discord character card. Public via `?slug=` (public-safe), or authenticated
 * via `?characterId=` + an API key with the discord:embed scope (owner's full card).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const characterId = url.searchParams.get("characterId");

  if (slug) {
    if (!(await checkRateLimit(`pub:${clientIp(request)}`, 120, 60))) {
      return apiError("rate_limited", "Too many requests — slow down.", 429);
    }
    const loaded = await loadPublicBySlug(slug);
    if (!loaded) return apiError("not_found", "No public character with that slug.", 404);
    return apiOk(discordCard(loaded.vm, loaded.shareUrl));
  }

  if (characterId) {
    const guard = await guardOwnedCharacter(request, characterId, "discord:embed");
    if (!guard.ok) return guard.response;
    return apiOk(discordCard(guard.load.vm, guard.load.shareUrl));
  }

  return apiError("bad_request", "Provide ?slug= (public) or ?characterId= (with an API key).", 400);
}
