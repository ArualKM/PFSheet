import { apiOk } from "@/lib/api/response";
import { guardOwnedCharacter } from "@/lib/api/guard";
import { characterSummary } from "@/lib/character/api-shapes";

export const dynamic = "force-dynamic";

/** §14.3 Authenticated character summary (owner's own character; full values). */
export async function GET(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  const guard = await guardOwnedCharacter(request, characterId, "characters:summary");
  if (!guard.ok) return guard.response;
  return apiOk(characterSummary(guard.load.vm));
}
