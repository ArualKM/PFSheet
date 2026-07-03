import { z } from "zod";

/** §18 Backgrounds & Occupations (3pp) — a narrative background plus an occupation that grants
 * class-skill picks and sometimes a bonus-feat choice. No engine math; gated by
 * isModuleKeyEnabled(c, "backgrounds_occupations"). Class skills are set manually — the occupation
 * text says "choose N of the following as class skills", a table choice we never auto-apply. */

export const backgroundRefSchema = z.object({
  name: z.string().default(""),
  /** Links a `background_compendium` row (pick cache). */
  compendiumId: z.string().optional(),
  description: z.string().optional(),
});
export type BackgroundRef = z.infer<typeof backgroundRefSchema>;

export const occupationRefSchema = z.object({
  name: z.string().default(""),
  /** Links an `occupation_compendium` row (pick cache). */
  compendiumId: z.string().optional(),
  /** The class-skills / benefit text ("Skills: Choose 2 of the following as class skills."). */
  benefit: z.string().optional(),
  /** The raw granted-feat cell — in the data it carries the skill list continuation plus a
   * "Bonus Feat: Choose either X or Y." clause (parseOccupationFeats extracts the names). */
  grantedFeat: z.string().optional(),
  description: z.string().optional(),
});
export type OccupationRef = z.infer<typeof occupationRefSchema>;

export const backgroundOccupationBlockSchema = z.object({
  background: backgroundRefSchema.optional(),
  occupation: occupationRefSchema.optional(),
  notes: z.string().optional(),
});
export type BackgroundOccupationBlock = z.infer<typeof backgroundOccupationBlockSchema>;

/** Feat names offered by an occupation's granted-feat cell. The compendium cell reads like
 * "Acrobatics, Climb, … <br><br>Bonus Feat: Choose Athletic, Endurance, or Run." — the names come
 * from the clause after "Bonus Feat:", split on commas/"or". Empty when nothing is granted. */
export function parseOccupationFeats(grantedFeat: string | null | undefined): string[] {
  const text = String(grantedFeat ?? "").replace(/<br\s*\/?>/gi, "\n");
  const m = text.match(/bonus feats?:\s*([^\n]+)/i);
  if (!m) return [];
  const clause = m[1]!.replace(/^choose\s+(either\s+)?/i, "").replace(/\.\s*$/, "");
  return clause
    .split(/,\s*|\s+or\s+/i)
    .map((s) => s.trim().replace(/^(and|or)\s+/i, ""))
    .filter(Boolean);
}
