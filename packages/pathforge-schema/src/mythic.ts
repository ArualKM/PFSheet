import { z } from "zod";
import { sourceRefSchema, resourceRefSchema } from "./common";

/** §18 Mythic Adventures (Paizo) — a parallel "tier" track (1–10) layered on class levels, granting a
 * mythic-power pool spent on the Surge (+a die to a d20), a chosen path with per-tier abilities, and
 * tier-gated base abilities (Amazing Initiative, Hard to Kill, …). Gated by rules.variants.mythic. */

export const MYTHIC_PATHS = [
  "none",
  "archmage",
  "champion",
  "guardian",
  "hierophant",
  "marshal",
  "trickster",
] as const;
export type MythicPath = (typeof MYTHIC_PATHS)[number];

/** A chosen path/universal ability (mirrors a feature so it can carry uses). */
export const mythicAbilityEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["path", "universal", "feature"]).default("path"),
  path: z.enum(MYTHIC_PATHS).optional(),
  tierGained: z.number().int().min(1).max(10).optional(),
  description: z.string().optional(),
  uses: resourceRefSchema.optional(),
  source: sourceRefSchema.optional(),
});
export type MythicAbilityEntry = z.infer<typeof mythicAbilityEntrySchema>;

export const mythicAbilityBoostSchema = z.object({
  id: z.string(),
  tier: z.number().int(),
  /** Which ability the +2 mythic tier boost was assigned to. */
  ability: z.string(),
});

export const mythicBlockSchema = z.object({
  tier: z.number().int().min(0).max(10).default(0),
  path: z.enum(MYTHIC_PATHS).default("none"),
  /** Current mythic power; the max is derived (3 + 2×tier). */
  mythicPowerCurrent: z.number().int().optional(),
  abilityBoosts: z.array(mythicAbilityBoostSchema).default([]),
  pathAbilities: z.array(mythicAbilityEntrySchema).default([]),
});
export type MythicBlock = z.infer<typeof mythicBlockSchema>;

/** Mythic power pool maximum: 3 + 2×tier uses/day (0 at tier 0). */
export function maxMythicPower(tier: number): number {
  return tier > 0 ? 3 + 2 * tier : 0;
}

/** The Surge die scales by tier band: 1d6 (1–3) / 1d8 (4–6) / 1d10 (7–9) / 1d12 (10). */
export function mythicSurgeDie(tier: number): string {
  if (tier <= 0) return "";
  if (tier <= 3) return "1d6";
  if (tier <= 6) return "1d8";
  if (tier <= 9) return "1d10";
  return "1d12";
}
