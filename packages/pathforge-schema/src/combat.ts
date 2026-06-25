import { z } from "zod";
import { modifierEntrySchema, numberOrFormulaSchema } from "./common";

/** §6.6 Combat */
export const attackEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  attackType: z.enum(["melee", "ranged", "natural", "cmb", "special"]).default("melee"),
  attackFormula: z.string().optional(),
  damageFormula: z.string().optional(),
  damageType: z.string().optional(),
  critRange: z.string().optional(),
  critMultiplier: z.string().optional(),
  range: z.string().optional(),
  ammo: z.string().optional(),
  notes: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  conditionalModifiers: z.array(modifierEntrySchema).default([]),
  showInCombat: z.boolean().optional().default(true),
});
export type AttackEntry = z.infer<typeof attackEntrySchema>;

export const combatBlockSchema = z.object({
  initiative: z.object({
    formula: z.string(),
    conditionalModifiers: z.array(modifierEntrySchema).default([]),
  }),
  speed: z.object({
    base: z.string().default("30 ft"),
    withArmor: z.string().optional(),
    fly: z.string().optional(),
    swim: z.string().optional(),
    climb: z.string().optional(),
    burrow: z.string().optional(),
    other: z.string().optional(),
  }),
  bab: z.object({
    total: numberOrFormulaSchema.default(0),
    progression: z.enum(["full", "three_quarter", "half", "custom"]).optional(),
    formula: z.string().optional(),
  }),
  attackBonuses: z.object({
    melee: z.string(),
    ranged: z.string(),
    cmb: z.string(),
  }),
  attacks: z.array(attackEntrySchema).default([]),
  offensiveFeatureIds: z.array(z.string()).default([]),
});
export type CombatBlock = z.infer<typeof combatBlockSchema>;
