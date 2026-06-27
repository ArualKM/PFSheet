import { apiOk } from "@/lib/api/response";
import { guardOwnedCharacter } from "@/lib/api/guard";
import { characterStats } from "@/lib/character/api-shapes";

export const dynamic = "force-dynamic";

/** Authenticated full stats (abilities/skills/attacks) for the owner's character. */
export async function GET(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  const guard = await guardOwnedCharacter(request, characterId, "characters:read");
  if (!guard.ok) return guard.response;
  return apiOk(characterStats(guard.load.vm));
}
