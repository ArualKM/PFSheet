import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { isModuleKeyEnabled } from "@pathforge/schema";

/**
 * Oaths (Spheres of Power optional rule) — the Oath-point budget pass. Points earned = Σ oath
 * points + bonusPoints; points spent = Σ boon costs. Overspending WARNS, never blocks ("see text"
 * costs default to 1 at pick time and are legally adjusted at the table). Emitted as
 * `summary.oaths` from computeCharacter when the `oaths` module is enabled.
 */

export type OathsSummary = {
  /** Σ oath points + bonusPoints. */
  pointsEarned: number;
  /** Σ boon costs. */
  pointsSpent: number;
  /** earned − spent; negative = overspent (also warned). */
  available: number;
  bonusPoints: number;
  oathCount: number;
  boonCount: number;
  warnings: string[];
};

export function computeOaths(character: PathForgeCharacterV1): OathsSummary | undefined {
  if (!isModuleKeyEnabled(character, "oaths")) return undefined;
  const block = character.oaths;
  if (!block) return undefined;

  const bonusPoints = Math.floor(block.bonusPoints || 0);
  const pointsEarned =
    block.oaths.reduce((sum, o) => sum + Math.max(0, Math.floor(o.points || 0)), 0) + bonusPoints;
  const pointsSpent = block.boons.reduce((sum, b) => sum + Math.max(0, Math.floor(b.cost || 0)), 0);
  const available = pointsEarned - pointsSpent;

  const warnings: string[] = [];
  if (available < 0) {
    warnings.push(`Overspent: ${pointsSpent} Oath points spent exceed the ${pointsEarned} earned.`);
  }

  return {
    pointsEarned,
    pointsSpent,
    available,
    bonusPoints,
    oathCount: block.oaths.length,
    boonCount: block.boons.length,
    warnings,
  };
}
