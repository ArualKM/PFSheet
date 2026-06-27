import { z } from "zod";
import { modifierEntrySchema, numberOrFormulaSchema } from "./common";

/** §6.4 Health */
export const hitDiceEntrySchema = z.object({
  classId: z.string().optional(),
  level: z.number().int(),
  die: z.string(),
  rolledOrTaken: z.number().int(),
  favoredClassBonus: z.enum(["hp", "skill", "other"]).nullable().optional(),
});
export type HitDiceEntry = z.infer<typeof hitDiceEntrySchema>;

export const healthBlockSchema = z.object({
  maxHp: numberOrFormulaSchema.default(0),
  currentHp: z.number().int().default(0),
  tempHp: z.number().int().default(0),
  nonlethalDamage: z.number().int().default(0),
  /** Negative levels from energy drain: −1 per level to attacks/saves/checks and −5 hp each. */
  negativeLevels: z.number().int().default(0),
  hitDice: z.array(hitDiceEntrySchema).default([]),
  damageReduction: z.array(modifierEntrySchema).default([]),
  energyResistance: z.array(modifierEntrySchema).default([]),
  immunities: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
});
export type HealthBlock = z.infer<typeof healthBlockSchema>;

/** §6.5 Defenses */
export const saveEntrySchema = z.object({
  base: z.number().int().default(0),
  abilityKey: z.string().optional(),
  formula: z.string().optional(),
  total: z.number().int().optional(),
  conditionalModifiers: z.array(modifierEntrySchema).default([]),
  misc: z.array(modifierEntrySchema).default([]),
});
export type SaveEntry = z.infer<typeof saveEntrySchema>;

export const armorClassSchema = z.object({
  total: z.number().int().optional(),
  touch: z.number().int().optional(),
  flatFooted: z.number().int().optional(),
  cmd: z.number().int().optional(),
  formulas: z.object({
    total: z.string(),
    touch: z.string(),
    flatFooted: z.string(),
    cmd: z.string(),
  }),
  conditionalModifiers: z.array(modifierEntrySchema).default([]),
});
export type ArmorClass = z.infer<typeof armorClassSchema>;

/**
 * A situational defense bonus (e.g. "+2 vs fear", "+4 vs poison", dwarf's "+2 vs spells"). These are
 * conditional by nature, so they are recorded + shown for reference rather than folded into base
 * AC/save totals — the player applies them when the trigger condition is met.
 */
export const conditionalDefenseSchema = z.object({
  id: z.string(),
  target: z
    .enum(["ac", "touch", "saves", "fortitude", "reflex", "will", "all"])
    .default("saves"),
  bonus: z.number().int().default(0),
  condition: z.string().default(""),
  notes: z.string().optional(),
});
export type ConditionalDefense = z.infer<typeof conditionalDefenseSchema>;

export const defenseBlockSchema = z.object({
  armorClass: armorClassSchema,
  savingThrows: z.object({
    fortitude: saveEntrySchema,
    reflex: saveEntrySchema,
    will: saveEntrySchema,
  }),
  spellResistance: numberOrFormulaSchema.optional(),
  conditionalDefenses: z.array(conditionalDefenseSchema).default([]),
  defensiveItemIds: z.array(z.string()).default([]),
  defensiveFeatureIds: z.array(z.string()).default([]),
});
export type DefenseBlock = z.infer<typeof defenseBlockSchema>;

/** §6 Senses */
export const sensesBlockSchema = z.object({
  perceptionFormula: z.string().optional(),
  senses: z.array(z.string()).default([]),
  vision: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type SensesBlock = z.infer<typeof sensesBlockSchema>;
