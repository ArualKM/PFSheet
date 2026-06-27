import { apiOk } from "@/lib/api/response";
import { guardOwnedCharacter } from "@/lib/api/guard";
import { characterPortrait } from "@/lib/character/api-shapes";

export const dynamic = "force-dynamic";

/** Authenticated portrait reference for the owner's character. */
export async function GET(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  const guard = await guardOwnedCharacter(request, characterId, "characters:portrait");
  if (!guard.ok) return guard.response;
  return apiOk(characterPortrait(guard.load.vm));
}
