import { z } from "zod";
import { sourceRefSchema } from "./common";

/** §18 Psionics (Dreamscarred Press) — a point-based casting analogue: a per-day Power Point pool
 * (class table + key-ability bonus) spent on Powers Known, gated by manifester level. Gated by
 * isModuleKeyEnabled(c, "psionics"). Powers are the discrete options → compendium + paste-parser. */

export const PSIONIC_DISCIPLINES = [
  "generalist",
  "clairsentience",
  "metacreativity",
  "psychokinesis",
  "psychometabolism",
  "psychoportation",
  "telepathy",
] as const;
export type PsionicDiscipline = (typeof PSIONIC_DISCIPLINES)[number];

export const psionicClassEntrySchema = z.object({
  id: z.string(),
  className: z.string(),
  manifesterLevel: z.number().int().min(0).default(0),
  keyAbility: z.string().default("int"),
  /** Base power points/day from the class table (entered until the table is seeded). */
  basePowerPoints: z.number().int().min(0).default(0),
  discipline: z.enum(PSIONIC_DISCIPLINES).default("generalist"),
});
export type PsionicClassEntry = z.infer<typeof psionicClassEntrySchema>;

export const psionicPowerEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int().min(0).max(9).default(1),
  discipline: z.string().optional(),
  ppCost: z.number().int().optional(),
  augment: z.string().optional(),
  description: z.string().optional(),
  /** Links to a future power_compendium row (paste/pick cache). */
  compendiumId: z.string().optional(),
  source: sourceRefSchema.optional(),
});
export type PsionicPowerEntry = z.infer<typeof psionicPowerEntrySchema>;

export const psionicsBlockSchema = z.object({
  classes: z.array(psionicClassEntrySchema).default([]),
  /** Current power points; the maximum is derived (Σ base + key-ability bonus). */
  powerPointsCurrent: z.number().int().optional(),
  powersKnown: z.array(psionicPowerEntrySchema).default([]),
  /** Binary psionic-focus state (expended to fuel psionic feats). */
  psionicFocus: z.boolean().optional(),
});
export type PsionicsBlock = z.infer<typeof psionicsBlockSchema>;

/** Bonus power points from a high key ability: ⌊keyAbilityMod × manifesterLevel ÷ 2⌋, floored at 0. */
export function bonusPowerPoints(keyAbilityMod: number, manifesterLevel: number): number {
  return Math.max(0, Math.floor((keyAbilityMod * manifesterLevel) / 2));
}
