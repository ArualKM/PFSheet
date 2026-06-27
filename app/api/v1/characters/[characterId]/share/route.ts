import { apiOk } from "@/lib/api/response";
import { guardOwnedCharacter } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/** Authenticated share metadata (visibility + public link, if any). */
export async function GET(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  const guard = await guardOwnedCharacter(request, characterId, "characters:read");
  if (!guard.ok) return guard.response;
  return apiOk({
    visibility: guard.load.visibility,
    publicSlug: guard.load.publicSlug,
    shareUrl: guard.load.shareUrl ?? null,
  });
}
