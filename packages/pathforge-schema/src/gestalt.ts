import type { PathForgeCharacterV1 } from "./character";

/** §18 Gestalt variant — a character advances in two class tracks at once and takes the BEST of each
 * (BAB, each save, Hit Die, class features). These helpers expose the per-track totals so the
 * class-derived recompute can take maxima instead of sums, and so the character level is the higher
 * track total rather than the sum of every class level. */

export function gestaltTrackLevels(character: PathForgeCharacterV1): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const c of character.identity.classes) {
    if (c.track === "b") b += c.level;
    else a += c.level;
  }
  return { a, b };
}

/** The gestalt character level = the higher of the two track totals (NOT the sum of all class levels). */
export function gestaltLevel(character: PathForgeCharacterV1): number {
  const { a, b } = gestaltTrackLevels(character);
  return Math.max(a, b);
}

export function isGestalt(character: PathForgeCharacterV1): boolean {
  return character.rules.modules.some((m) => m.key === "gestalt" && m.enabled !== false);
}

/** How many classes sit on each gestalt track (by the `track` field; unset ⇒ "a"). Counts classes,
 * not levels, so the collapse check below is robust even to level-0 rows. */
export function gestaltTrackClassCounts(character: PathForgeCharacterV1): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const c of character.identity.classes) {
    if (c.track === "b") b += 1;
    else a += 1;
  }
  return { a, b };
}

// gestaltTracksCollapsed lives in class-catalog.ts — it needs resolveClassPreset (which class-catalog
// owns) to tell a genuine collapse from a preset-less class merely parked on the other track, and
// importing that here would create a cycle.

/** Recover a collapsed gestalt by assigning classes alternately to the two tracks in their current
 * order (a, b, a, …). For the dominant 2-class gestalt this is the exact intended one-per-track
 * split; for 3+ it's an even best-effort the user can then adjust. Mutates in place; never touches
 * levels. Callers still recompute BAB/saves/HP + totalLevel afterward. */
export function splitGestaltTracks(character: PathForgeCharacterV1): void {
  character.identity.classes.forEach((c, i) => {
    c.track = i % 2 === 0 ? "a" : "b";
  });
}
