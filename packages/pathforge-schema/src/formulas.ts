import { z } from "zod";

/**
 * §8 Formula block. Holds user-authored formula overrides and custom named
 * formulas. Default/built-in formulas live in @pathforge/rules-pf1e; this block
 * only stores deviations the player (or a rule module) introduced.
 */
export const formulaOverrideSchema = z.object({
  targetPath: z.string(),
  formula: z.string(),
  enabled: z.boolean().default(true),
  /** Original/default formula, kept so "Reset to default" works. */
  defaultFormula: z.string().optional(),
  note: z.string().optional(),
  gmReviewRecommended: z.boolean().optional(),
});
export type FormulaOverride = z.infer<typeof formulaOverrideSchema>;

export const namedFormulaSchema = z.object({
  id: z.string(),
  label: z.string(),
  formula: z.string(),
  description: z.string().optional(),
});
export type NamedFormula = z.infer<typeof namedFormulaSchema>;

export const formulaBlockSchema = z.object({
  /** Overrides keyed by target path, e.g. "defenses.armorClass.total". */
  overrides: z.record(z.string(), formulaOverrideSchema).default({}),
  custom: z.array(namedFormulaSchema).default([]),
});
export type FormulaBlock = z.infer<typeof formulaBlockSchema>;
