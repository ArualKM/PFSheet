import { notFound } from "next/navigation";
import { safeParseCharacter, type CharacterValidationResult } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { buildMasterCache, masterCacheEquals } from "@/lib/character/companion-sync";

export type LoadCharacterForEditResult = {
  data: { id: string; name: string };
  /** The safe-parse result — callers must check `.ok` before rendering an editor over `.character`. */
  result: CharacterValidationResult;
  sheetVersion: number;
};

/**
 * Shared "load a character for editing" preamble, extracted verbatim from
 * `app/(app)/characters/[characterId]/edit/page.tsx` (S6 Pillar 3 §4.1 — the wizard page needs the
 * exact same load) so the two pages can't drift: auth-gate, load the row (incl. `sheet_version`),
 * safe-parse the sheet, and — for a master-linked familiar — refresh the cached master stats on
 * load, so opening the sheet right after leveling the master shows current numbers even if the
 * master's last save predates the sync hook.
 *
 * The refresh persist is a COMPARE-AND-SWAP on the version just read: a save landing from another
 * tab between our read and write must not be wholesale overwritten. On a CAS miss we re-read the row
 * that won the race and apply the refreshed cache to the in-memory result only (not persisted) — the
 * next save carries it via the normal CAS path.
 *
 * Calls `notFound()` directly (throwing Next's not-found signal) when the row can't be loaded, same
 * as the original inline code.
 */
export async function loadCharacterForEdit(characterId: string): Promise<LoadCharacterForEditResult> {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, sheet_data, sheet_version, parent_character_id")
    .eq("id", characterId)
    .single();
  if (error || !data) notFound();

  const result = safeParseCharacter(data.sheet_data);
  let sheetVersion = data.sheet_version;

  if (
    result.ok &&
    result.character.companion?.syncEnabled &&
    result.character.companion.type === "familiar" &&
    data.parent_character_id
  ) {
    const { data: master } = await supabase
      .from("characters")
      .select("id, sheet_data")
      .eq("id", data.parent_character_id)
      .maybeSingle();
    const masterParsed = master ? safeParseCharacter(master.sheet_data) : null;
    if (master && masterParsed?.ok) {
      const cache = buildMasterCache(master.id, masterParsed.character, computeCharacter(masterParsed.character));
      if (!masterCacheEquals(result.character.companion.master, cache)) {
        result.character.companion.master = cache;
        const computed = computeCharacter(result.character);
        const { data: updated } = await supabase
          .from("characters")
          .update({
            sheet_data: result.character as never,
            computed_summary: computed.summary as never,
            last_calculated_at: new Date().toISOString(),
          })
          .eq("id", characterId)
          .eq("sheet_version", data.sheet_version)
          .select("sheet_version")
          .maybeSingle();
        if (updated) {
          sheetVersion = updated.sheet_version;
        } else {
          // Concurrent save won the race — re-read the row so the caller starts from THAT sheet
          // (not our stale copy) and re-apply the cache refresh in memory only; the next save
          // persists it via the normal CAS path.
          const { data: current } = await supabase
            .from("characters")
            .select("sheet_data, sheet_version")
            .eq("id", characterId)
            .maybeSingle();
          if (current) {
            const reparsed = safeParseCharacter(current.sheet_data);
            if (reparsed.ok) {
              if (reparsed.character.companion) reparsed.character.companion.master = cache;
              result.character = reparsed.character;
            }
            sheetVersion = current.sheet_version;
          }
        }
      }
    }
  }

  return { data: { id: data.id, name: data.name }, result, sheetVersion };
}
