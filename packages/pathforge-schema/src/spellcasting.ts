import { z } from "zod";
import { modifierEntrySchema, numberOrFormulaSchema, sourceRefSchema } from "./common";

/** §6.10 Spellcasting */
export const spellSlotsSchema = z.object({
  total: z.number().int().optional(),
  used: z.number().int().optional().default(0),
  bonus: z.number().int().optional(),
});
export type SpellSlots = z.infer<typeof spellSlotsSchema>;

export const spellcasterEntrySchema = z.object({
  id: z.string(),
  className: z.string(),
  archetype: z.string().optional(),
  /** Links a caster to its CLASS_CATALOG preset (rename-proof add-vs-update matching). */
  presetKey: z.string().optional(),
  casterType: z.enum(["prepared", "spontaneous", "spellbook", "hybrid"]).default("prepared"),
  casterLevel: numberOrFormulaSchema.default(0),
  concentrationFormula: z.string().default(""),
  castingAbility: z.string().default("int"),
  spellFailure: z.number().int().optional(),
  conditionalModifiers: z.array(modifierEntrySchema).default([]),
  /** Keyed by spell level "0".."9". */
  spellsPerDay: z.record(z.string(), spellSlotsSchema).default({}),
  bonusSpells: z.record(z.string(), z.number().int()).default({}),
  saveDcFormula: z.string().default(""),
});
export type SpellcasterEntry = z.infer<typeof spellcasterEntrySchema>;

/** A spell reference. `compendiumId` links to the public spell_compendium table. */
export const spellRefSchema = z.object({
  id: z.string(),
  compendiumId: z.string().optional(),
  name: z.string(),
  level: z.number().int().min(0).max(9),
  casterId: z.string().optional(),
  school: z.string().optional(),
  source: sourceRefSchema.optional(),
  notes: z.string().optional(),
});
export type SpellRef = z.infer<typeof spellRefSchema>;

export const spellbookEntrySchema = spellRefSchema.extend({
  inSpellbook: z.boolean().optional().default(true),
});
export type SpellbookEntry = z.infer<typeof spellbookEntrySchema>;

export const preparedSpellEntrySchema = spellRefSchema.extend({
  prepared: z.number().int().min(0).default(1),
  used: z.number().int().min(0).default(0),
  metamagicIds: z.array(z.string()).default([]),
});
export type PreparedSpellEntry = z.infer<typeof preparedSpellEntrySchema>;

export const knownSpellEntrySchema = spellRefSchema.extend({
  atWill: z.boolean().optional(),
});
export type KnownSpellEntry = z.infer<typeof knownSpellEntrySchema>;

export const spellLikeAbilityEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  usesPerDay: numberOrFormulaSchema.optional(),
  used: z.number().int().optional().default(0),
  casterLevel: z.number().int().optional(),
  saveDcFormula: z.string().optional(),
  source: sourceRefSchema.optional(),
  notes: z.string().optional(),
});
export type SpellLikeAbilityEntry = z.infer<typeof spellLikeAbilityEntrySchema>;

export const metamagicEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  levelAdjust: z.number().int().default(0),
  source: sourceRefSchema.optional(),
  notes: z.string().optional(),
});
export type MetamagicEntry = z.infer<typeof metamagicEntrySchema>;

export const spellcastingBlockSchema = z.object({
  casters: z.array(spellcasterEntrySchema).default([]),
  spellbook: z.array(spellbookEntrySchema).default([]),
  preparedSpells: z.array(preparedSpellEntrySchema).default([]),
  knownSpells: z.array(knownSpellEntrySchema).default([]),
  spellLikeAbilities: z.array(spellLikeAbilityEntrySchema).default([]),
  metamagic: z.array(metamagicEntrySchema).default([]),
});
export type SpellcastingBlock = z.infer<typeof spellcastingBlockSchema>;
