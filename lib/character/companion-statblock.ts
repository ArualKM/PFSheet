import type { CompanionType, MasterBenefitEffect, PathForgeCharacterV1 } from "@pathforge/schema";
import {
  applyCompanionStatblock as applyAnimalCompanionStatblock,
  applyFamiliarBaseBody,
  applyFamiliarMasterBenefit,
  type CompanionStatblockRow,
} from "./companion-sync";

/**
 * Unified, type-aware, client-safe statblock→sheet apply — the single source of truth for turning a
 * picked compendium row into a companion character's sheet. Shared by `createCompanionAction`
 * (server, at companion CREATE — `lib/actions/characters.ts`) and `<CompanionStatblockPicker>`
 * (client, inside `ed.update`, re-picking a statblock on an EXISTING companion sheet in the editor).
 * Keeping both paths on this one function means they can never drift.
 */

/** familiar_compendium row shape — no full statblock, just the slug/name + the prose describing the
 * benefit the MASTER gains ({@link applyFamiliarBaseBody} supplies the actual creature body from a
 * hardcoded catalog, since the compendium ships none). */
export type FamiliarCompendiumRow = {
  slug: string;
  name: string | null;
  granted_ability?: string | null;
};

/** Either shape a caller might pick from `STATBLOCK_SOURCES`' two backing compendiums. */
export type CompanionCompendiumRow = CompanionStatblockRow | FamiliarCompendiumRow;

/** Which compendium backs the statblock search/apply for a companion type (absent = no statblocks:
 * eidolons/"other" have none, and a cohort is a PC-race humanoid — it uses the normal race picker in
 * Identity & Details instead of a creature statblock). String-keyed (not `CompanionType`-keyed) so
 * callers holding a plain `<select>` value can index it directly without a cast. Shared by the
 * create-flow's `<CompanionsCard>` search and the editor's `<CompanionStatblockPicker>` so the two
 * never disagree on what backs which type. */
export const STATBLOCK_SOURCES: Record<
  string,
  { table: "animal_companion_compendium" | "familiar_compendium"; rpc: string; hint: string } | undefined
> = {
  animal_companion: { table: "animal_companion_compendium", rpc: "search_animal_companion_compendium", hint: "Wolf, roc, big cat…" },
  mount: { table: "animal_companion_compendium", rpc: "search_animal_companion_compendium", hint: "Horse, wolf…" },
  familiar: { table: "familiar_compendium", rpc: "search_familiar_compendium", hint: "Cat, owl, thrush…" },
};

/**
 * Apply a picked compendium row to a companion's sheet, mutating `c` in place. Sets:
 *  - `identity.race = row.name` — for a creature companion the statblock effectively IS its "race"
 *    (cohorts are the exception; they use the normal PC race picker instead of this one).
 *  - the base body: ability scores / size / speed / natural attacks, delegated to companion-sync's
 *    per-type helpers (`applyCompanionStatblock` for animal_companion/mount, `applyFamiliarBaseBody`
 *    for familiars) — both replace their own previously statblock-derived attacks/features rather than
 *    appending, so re-picking a DIFFERENT row swaps the creature instead of stacking two statblocks.
 *  - `companion.type` + `companion.compendiumId`.
 *  - for familiars only: `companion.masterBenefit`, parsed from `granted_ability` (via
 *    `applyFamiliarMasterBenefit`, which also replaces/clears any prior "Master benefit" feature).
 *
 * Never clobbers fields the row doesn't cover: any other `companion.*` field (archetype, syncEnabled,
 * the cached master stats) is carried forward untouched via the spread below.
 */
export function applyCompanionStatblock(c: PathForgeCharacterV1, row: CompanionCompendiumRow, type: CompanionType): void {
  if (row.name) {
    c.identity.race = row.name;
    // Mark the race as APPLIED (with no pending PC-race ability mods): without this,
    // IdentityEditor's raceNeedsApply banner permanently nags "ability modifiers for Wolf aren't
    // applied yet" and steers the player to the PC race_compendium browser — the wrong tool for a
    // creature (review finding). Empty abilityMods also neutralizes applyRace's revert-on-reapply
    // (it subtracts the PREVIOUS raceApplied.abilityMods — stale PC-race mods here would corrupt
    // the statblock's wholesale-written scores).
    c.identity.raceApplied = { name: row.name, abilityMods: {} };
  }

  let masterBenefit: { effects: MasterBenefitEffect[]; rawText?: string } | undefined;

  if (type === "familiar") {
    const familiarRow = row as FamiliarCompendiumRow;
    applyFamiliarBaseBody(c, familiarRow.slug);
    masterBenefit = applyFamiliarMasterBenefit(c, familiarRow.granted_ability ?? null);
  } else {
    applyAnimalCompanionStatblock(c, row as unknown as CompanionStatblockRow);
  }

  c.companion = {
    ...c.companion,
    type,
    compendiumId: row.slug,
    // The applied creature's display name, independent of identity.race (which the player may
    // hand-edit afterwards) — the picker's "current statblock" chip reads THIS, not race.
    statblockName: row.name ?? undefined,
    ...(type === "familiar" ? { masterBenefit } : {}),
  };
}
