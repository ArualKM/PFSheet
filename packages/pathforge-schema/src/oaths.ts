import { z } from "zod";

/** §18 Oaths (Spheres of Power optional rule, Drop Dead Studios) — sworn restrictions each worth
 * Oath POINTS, which are spent on oath BOONS. Gated by isModuleKeyEnabled(c, "oaths"). The budget
 * math lives in the engine (computeOaths → summary.oaths); overspending warns, never blocks.
 * Oaths/boons are the discrete options → oath_compendium / oath_boon_compendium + picker. */

export const oathEntrySchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  /** Links an `oath_compendium` row (pick cache). */
  compendiumId: z.string().optional(),
  /** Oath points this oath earns. "see text" compendium rows default to 1 with the raw cell noted
   * at pick time (parseOathPoints) — adjust here once the table rules on it. */
  points: z.number().int().min(0).default(1),
  /** The vow itself — what the character must (not) do. */
  oathText: z.string().optional(),
  defiancePenalty: z.string().optional(),
  atonement: z.string().optional(),
  custom: z.boolean().optional(),
  notes: z.string().optional(),
});
export type OathEntry = z.infer<typeof oathEntrySchema>;

export const oathBoonEntrySchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  /** Links an `oath_boon_compendium` row (pick cache). */
  compendiumId: z.string().optional(),
  /** Oath points this boon costs ("see text" rows default to 1 with the raw cell noted). */
  cost: z.number().int().min(0).default(1),
  /** "Ex" | "Su" — a free string; many compendium rows are untyped. */
  boonType: z.string().optional(),
  description: z.string().optional(),
  custom: z.boolean().optional(),
  notes: z.string().optional(),
});
export type OathBoonEntry = z.infer<typeof oathBoonEntrySchema>;

export const oathsBlockSchema = z.object({
  oaths: z.array(oathEntrySchema).default([]),
  boons: z.array(oathBoonEntrySchema).default([]),
  /** Adjustment to the earned total (GM grants, the resolved value of a "see text" oath). */
  bonusPoints: z.number().int().default(0),
  notes: z.string().optional(),
});
export type OathsBlock = z.infer<typeof oathsBlockSchema>;

/** Parse a compendium point cell ("1"…"10" | "see text") — a non-numeric cell keeps the raw string
 * so the picker can note it on the entry instead of silently faking a number. */
export function parseOathPoints(raw: string | null | undefined): { points: number; raw?: string } {
  const s = String(raw ?? "").trim();
  if (/^\d+$/.test(s)) return { points: Number.parseInt(s, 10) };
  return { points: 1, ...(s ? { raw: s } : {}) };
}
