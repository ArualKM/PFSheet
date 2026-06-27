import { z } from "zod";
import type { PathForgeCharacterV1 } from "./character";

/** §18 optional subsystem — Honor (d20pfsrd / Ultimate Campaign). A 0–100 reputation score that
 * starts at Charisma score + character level and drifts via witnessed deeds tied to an honor code.
 * At 0 honor a character is dishonored: −2 on Will saves and Charisma-based skill checks. */

export const HONOR_CODES = ["general", "chivalric", "criminal", "political", "samurai", "tribal"] as const;
export type HonorCode = (typeof HONOR_CODES)[number];

export const honorEventSchema = z.object({
  id: z.string(),
  delta: z.number().int(),
  reason: z.string().optional(),
});
export type HonorEvent = z.infer<typeof honorEventSchema>;

export const honorBlockSchema = z.object({
  code: z.enum(HONOR_CODES).default("general"),
  /** Override the Cha-score + level baseline (e.g. a non-standard starting honor). */
  baselineOverride: z.number().int().optional(),
  events: z.array(honorEventSchema).default([]),
  /** The once-per-session honor spend has been used. */
  spentThisSession: z.boolean().optional(),
});
export type HonorBlock = z.infer<typeof honorBlockSchema>;

/** A small catalog of common honor events for quick entry (delta + label). */
export const HONOR_EVENTS: { label: string; delta: number; code?: HonorCode }[] = [
  { label: "Won a formal duel", delta: 2, code: "chivalric" },
  { label: "Defeated a worthy foe", delta: 1 },
  { label: "Kept a difficult oath", delta: 3 },
  { label: "Showed mercy to the defeated", delta: 1, code: "chivalric" },
  { label: "Completed a quest for a lord", delta: 2, code: "political" },
  { label: "Performed seppuku / honorable death", delta: 5, code: "samurai" },
  { label: "Broke an oath", delta: -5 },
  { label: "Fled an even fight", delta: -2 },
  { label: "Attacked a helpless foe", delta: -3 },
  { label: "Was publicly shamed", delta: -4 },
  { label: "Betrayed an ally", delta: -6 },
];

export function honorBaseline(c: PathForgeCharacterV1): number {
  return c.abilities.primary.cha.score + c.identity.totalLevel;
}

/** Total honor: baseline (Cha score + level, or an override) + the sum of event deltas, clamped 0–100. */
export function honorScore(c: PathForgeCharacterV1): number {
  const base = c.honor?.baselineOverride ?? honorBaseline(c);
  const delta = (c.honor?.events ?? []).reduce((s, e) => s + e.delta, 0);
  return Math.max(0, Math.min(100, base + delta));
}

export function honorTier(score: number): string {
  if (score <= 0) return "Dishonored";
  if (score < 10) return "Tarnished";
  if (score < 35) return "Average";
  if (score < 60) return "Respected";
  if (score < 90) return "Honored";
  return "Legendary";
}
