import { z } from "zod";

/**
 * Shared vocabulary for the PathForge canonical character schema.
 * Every block module imports its primitives from here so the bonus/modifier
 * and formula systems stay consistent across the whole sheet.
 */

/** Where a value/feature/item came from — a book, module, or custom entry. */
export const sourceRefSchema = z.object({
  pack: z.string().optional(),
  book: z.string().optional(),
  page: z.string().optional(),
  module: z.string().optional(),
  custom: z.boolean().optional(),
  note: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/** Reference to a calculated target path, e.g. "defenses.armorClass.total". */
export const targetRefSchema = z.string();
export type TargetRef = z.infer<typeof targetRefSchema>;

/** A formula reference: a named/inline safe expression resolved by the engine. */
export const formulaRefSchema = z.object({
  formula: z.string(),
  label: z.string().optional(),
});
export type FormulaRef = z.infer<typeof formulaRefSchema>;

/** A value that may be a fixed number or a computed formula. */
export const numberOrFormulaSchema = z.union([z.number(), formulaRefSchema]);
export type NumberOrFormula = z.infer<typeof numberOrFormulaSchema>;

/** Pathfinder 1e bonus types (drive stacking behavior). */
export const BONUS_TYPES = [
  "armor",
  "shield",
  "natural_armor",
  "deflection",
  "dodge",
  "enhancement",
  "competence",
  "luck",
  "morale",
  "sacred",
  "profane",
  "insight",
  "resistance",
  "trait",
  "racial",
  "size",
  "circumstance",
  "alchemical",
  "inherent",
  "untyped",
  "penalty",
  "custom",
] as const;
export const bonusTypeSchema = z.enum(BONUS_TYPES);
export type BonusType = z.infer<typeof bonusTypeSchema>;

/** A single modifier line. The atom of the bonus engine. */
export const modifierEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  bonusType: bonusTypeSchema.optional(),
  source: sourceRefSchema.optional(),
  target: targetRefSchema.optional(),
  condition: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  stackingGroup: z.string().optional(),
  notes: z.string().optional(),
});
export type ModifierEntry = z.infer<typeof modifierEntrySchema>;

/** Operations an automation effect (feat/buff/feature) can perform on a target. */
export const automationOperationSchema = z.enum([
  "add",
  "subtract",
  "set",
  "multiply",
  "append",
  "toggle",
  "note",
]);
export type AutomationOperation = z.infer<typeof automationOperationSchema>;

/** A discrete automated effect applied to a target value. */
export const automationEffectSchema = z.object({
  id: z.string(),
  target: targetRefSchema,
  operation: automationOperationSchema,
  value: z.union([z.number(), z.string(), z.boolean()]),
  bonusType: bonusTypeSchema.optional(),
  condition: z.string().optional(),
  stackingGroup: z.string().optional(),
});
export type AutomationEffect = z.infer<typeof automationEffectSchema>;

/** Duration specification for buffs and timed effects. */
export const durationUnitSchema = z.enum([
  "rounds",
  "minutes",
  "hours",
  "days",
  "session",
  "rest",
  "permanent",
  "concentration",
  "custom",
]);
export type DurationUnit = z.infer<typeof durationUnitSchema>;

export const durationSpecSchema = z.object({
  unit: durationUnitSchema,
  amount: z.number().optional(),
  note: z.string().optional(),
});
export type DurationSpec = z.infer<typeof durationSpecSchema>;

/** A trackable, expendable resource (uses/day, points, charges). */
export const resourceRefSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  max: numberOrFormulaSchema.optional(),
  current: z.number().optional(),
  per: z.enum(["day", "encounter", "round", "minute", "hour", "rest", "custom"]).optional(),
  notes: z.string().optional(),
});
export type ResourceRef = z.infer<typeof resourceRefSchema>;

export const resourceDefinitionSchema = resourceRefSchema.extend({
  formula: z.string().optional(),
});
export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;

/**
 * The output contract of the formula engine for any calculated value.
 * Powers the "Show Math" formula inspector.
 */
export const calculationTermSchema = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  source: z.string().optional(),
  included: z.boolean(),
  reason: z.string().optional(),
});
export type CalculationTerm = z.infer<typeof calculationTermSchema>;

export const calculationResultSchema = z.object({
  path: z.string(),
  value: z.union([z.number(), z.string(), z.boolean()]),
  formula: z.string().optional(),
  dependencies: z.array(z.string()),
  terms: z.array(calculationTermSchema),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});
export type CalculationResult = z.infer<typeof calculationResultSchema>;

/** A definition added by a rule module (custom field, ability, resource). */
export const fieldDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  path: z.string(),
  type: z.enum(["number", "string", "boolean", "formula", "list", "object"]),
  default: z.unknown().optional(),
  description: z.string().optional(),
});
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

/** A patch a rule module applies to an existing formula. */
export const formulaPatchSchema = z.object({
  targetPath: z.string(),
  formula: z.string(),
  mode: z.enum(["replace", "append_term", "wrap"]).default("replace"),
  note: z.string().optional(),
});
export type FormulaPatch = z.infer<typeof formulaPatchSchema>;

/** GM review status used on feats/features. */
export const gmStatusSchema = z.enum(["unreviewed", "approved", "flagged", "rejected"]);
export type GmStatus = z.infer<typeof gmStatusSchema>;

/** Privacy level applied to a section or field. */
export const PRIVACY_LEVELS = [
  "private",
  "owner_only",
  "gm_only",
  "campaign",
  "party",
  "public",
  "custom",
] as const;
export const privacyLevelSchema = z.enum(PRIVACY_LEVELS);
export type PrivacyLevel = z.infer<typeof privacyLevelSchema>;

/** The six core PF1e ability keys. */
export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const abilityKeySchema = z.enum(ABILITY_KEYS);
export type AbilityKey = z.infer<typeof abilityKeySchema>;

/** Class progression enums + the prebuilt/compendium ClassPreset shape. Lives here (the dependency-free
 * base) so both class-catalog.ts (the hardcoded presets) and identity.ts (the per-row cached compendium
 * preset) can share one source without an import cycle. */
export const saveProgressionSchema = z.enum(["good", "poor"]);
export type SaveProgression = z.infer<typeof saveProgressionSchema>;
export const babProgressionSchema = z.enum(["full", "three_quarter", "half"]);
export type BabProgression = z.infer<typeof babProgressionSchema>;
export const casterTypeSchema = z.enum(["prepared", "spontaneous", "spellbook"]);
export type CasterType = z.infer<typeof casterTypeSchema>;

export const classPresetSchema = z.object({
  key: z.string(),
  name: z.string(),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  bab: babProgressionSchema,
  saves: z.object({ fortitude: saveProgressionSchema, reflex: saveProgressionSchema, will: saveProgressionSchema }),
  skillRanksPerLevel: z.number(),
  classSkillKeys: z.array(z.string()),
  caster: z
    .object({
      casterType: casterTypeSchema,
      castingAbility: abilityKeySchema,
      /** CL vs this class's level: "full" = level, "minus_three" = paladin/ranger (starts at 4th). */
      clProgression: z.enum(["full", "minus_three"]),
    })
    .optional(),
});
export type ClassPreset = z.infer<typeof classPresetSchema>;
