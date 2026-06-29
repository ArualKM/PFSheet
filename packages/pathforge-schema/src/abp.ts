import { z } from "zod";

/**
 * Automatic Bonus Progression (Pathfinder Unchained) — the player-assigned Mental and Physical
 * Prowess ability enhancements. The deterministic "big six" bonuses (resistance/attunement/
 * deflection/toughening) are derived from character level alone and live in the rules engine;
 * only Prowess needs stored choices, because the player picks WHICH ability score gains each +2.
 *
 * Source: Pathfinder Unchained, Automatic Bonus Progression.
 *  - Mental Prowess increments at levels 6, 11, 13, 15, 17 (one mental ability — Int/Wis/Cha — each).
 *  - Physical Prowess increments at levels 7, 12, 13, 16, 17 (one physical ability — Str/Dex/Con — each).
 * Each increment is a +2 enhancement bonus; no single ability can exceed +6 (three increments) from
 * this benefit. The model records, in order gained, the ability key each +2 increment was assigned to.
 */

/** Character levels at which a Mental Prowess +2 increment is gained. */
export const MENTAL_PROWESS_LEVELS = [6, 11, 13, 15, 17] as const;
/** Character levels at which a Physical Prowess +2 increment is gained. */
export const PHYSICAL_PROWESS_LEVELS = [7, 12, 13, 16, 17] as const;

/** The mental ability scores Mental Prowess can enhance. */
export const MENTAL_ABILITIES = ["int", "wis", "cha"] as const;
/** The physical ability scores Physical Prowess can enhance. */
export const PHYSICAL_ABILITIES = ["str", "dex", "con"] as const;

/** Most +2 increments any single ability can receive from prowess (i.e. a +6 enhancement cap). */
export const MAX_PROWESS_PER_ABILITY = 3;

export type ProwessTrack = "mental" | "physical";

/**
 * One assigned +2 prowess increment. Modeled as an id-bearing entity (not a bare ability key) so the
 * 3-way concurrent-edit merge keys it by `id` — two increments on the SAME ability are distinct entities
 * and survive a merge (a primitive `string[]` would set-merge and silently collapse a duplicate +2 into
 * one). Mirrors the Mythic `abilityBoosts` model.
 */
export const prowessIncrementSchema = z.object({
  id: z.string(),
  /** Ability key this +2 enhancement is applied to (int/wis/cha for mental; str/dex/con for physical). */
  ability: z.string(),
});
export type ProwessIncrement = z.infer<typeof prowessIncrementSchema>;

export const abpBlockSchema = z.object({
  /** Mental Prowess +2 increments (one per increment gained), in the order gained. */
  mentalProwess: z.array(prowessIncrementSchema).default([]),
  /** Physical Prowess +2 increments (one per increment gained), in the order gained. */
  physicalProwess: z.array(prowessIncrementSchema).default([]),
});
export type AbpBlock = z.infer<typeof abpBlockSchema>;

/** The ability keys a given prowess track may enhance. */
export function prowessAbilities(track: ProwessTrack): readonly string[] {
  return track === "mental" ? MENTAL_ABILITIES : PHYSICAL_ABILITIES;
}

/** Number of prowess increments unlocked at a character level for the given track. */
export function prowessSlots(track: ProwessTrack, level: number): number {
  const levels = track === "mental" ? MENTAL_PROWESS_LEVELS : PHYSICAL_PROWESS_LEVELS;
  return levels.filter((l) => l <= level).length;
}

/** The increment entities assigned to a track, read off the block. */
export function trackAssignments(block: AbpBlock | undefined, track: ProwessTrack): ProwessIncrement[] {
  if (!block) return [];
  return track === "mental" ? block.mentalProwess : block.physicalProwess;
}

/**
 * Per-ability enhancement bonus granted by the assigned prowess increments, respecting the increments
 * actually unlocked at `level` (a stale array from a level-down can't over-apply) and the +6 (three-
 * increment) cap per ability. Returns ability key → total enhancement bonus (always a multiple of 2).
 */
export function computeProwessBonuses(block: AbpBlock | undefined, level: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!block) return out;
  for (const track of ["mental", "physical"] as const) {
    const slots = prowessSlots(track, level);
    const assigned = trackAssignments(block, track).slice(0, slots);
    const counts: Record<string, number> = {};
    for (const inc of assigned) {
      const k = inc.ability.trim().toLowerCase();
      if (!k) continue;
      const next = (counts[k] ?? 0) + 1;
      if (next > MAX_PROWESS_PER_ABILITY) continue; // can't exceed +6 on any single ability
      counts[k] = next;
    }
    for (const [k, n] of Object.entries(counts)) {
      out[k] = (out[k] ?? 0) + n * 2;
    }
  }
  return out;
}
