import { z } from "zod";

/** §6.3 Abilities — supports the six core scores plus custom/secondary scores. */
export const abilityScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number().int(),
  baseScore: z.number().int().optional(),
  enhancement: z.number().int().optional(),
  inherent: z.number().int().optional(),
  drain: z.number().int().optional(),
  damage: z.number().int().optional(),
  penalty: z.number().int().optional(),
  tempAdjust: z.number().int().optional(),
  formula: z.string().optional(),
  notes: z.string().optional(),
});
export type AbilityScore = z.infer<typeof abilityScoreSchema>;

/**
 * The six core PF1e abilities are required and exhaustive (a `z.record` keyed by
 * an enum is only partial in Zod, which would let a character validate with
 * missing scores). Secondary/custom scores live in `custom`.
 */
export const abilityBlockSchema = z.object({
  primary: z.object({
    str: abilityScoreSchema,
    dex: abilityScoreSchema,
    con: abilityScoreSchema,
    int: abilityScoreSchema,
    wis: abilityScoreSchema,
    cha: abilityScoreSchema,
  }),
  custom: z.record(z.string(), abilityScoreSchema).default({}),
});
export type AbilityBlock = z.infer<typeof abilityBlockSchema>;
