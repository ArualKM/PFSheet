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
