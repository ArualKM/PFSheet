import { z } from "zod";
import { sourceRefSchema, classPresetSchema } from "./common";

/** An archetype applied to a class via the compendium builder — its name + the standard class features it
 * replaces (lowercased base names), used to suppress those features on level-up + to conflict-check a second
 * archetype (two archetypes can't both replace the same feature). The legacy `archetype` free-text stays. */
export const characterArchetypeSchema = z.object({
  name: z.string(),
  compendiumId: z.string().optional(),
  replaces: z.array(z.string()).default([]),
});
export type CharacterArchetype = z.infer<typeof characterArchetypeSchema>;

/** §6.1 Identity */
export const characterClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  archetype: z.string().optional(),
  /** Structured archetypes applied via the builder (additive to the legacy free-text `archetype`). */
  archetypes: z.array(characterArchetypeSchema).optional(),
  level: z.number().int().min(0),
  hitDie: z.string().optional(),
  favoredClass: z.boolean().optional(),
  /** Gestalt variant: which of the two parallel class tracks this class advances ("a" default / "b"). */
  track: z.enum(["a", "b"]).optional(),
  /** Links a row to its CLASS_CATALOG preset so BAB/saves/HP can recompute from classes. */
  presetKey: z.string().optional(),
  /** Links a row to a compendium class (`class_compendium` key) for the progression-driven builder. */
  compendiumId: z.string().optional(),
  /** Cached synthetic preset derived from the compendium row's `class_progression`, so
   * `recomputeClassDerived` stays self-contained + offline-safe (no session registry to prime). Resolved
   * alongside `presetKey`. */
  compendiumPreset: classPresetSchema.optional(),
  source: sourceRefSchema.optional(),
});
export type CharacterClass = z.infer<typeof characterClassSchema>;

/** Provenance for a race applied via the compendium builder — so re-applying a different race first reverts
 * the prior race's ability modifiers (added to score) + removes its standard-traits feature. */
export const raceAppliedSchema = z.object({
  name: z.string(),
  compendiumId: z.string().optional(),
  abilityMods: z.record(z.string(), z.number()).default({}),
  traitFeatureId: z.string().optional(),
});
export type RaceApplied = z.infer<typeof raceAppliedSchema>;

export const characterIdentitySchema = z.object({
  name: z.string().default("New Character"),
  playerName: z.string().optional(),
  alignment: z.string().optional(),
  race: z.string().optional(),
  /** Set by the race builder (additive to the free-text `race`). */
  raceApplied: raceAppliedSchema.optional(),
  ethnicity: z.string().optional(),
  deity: z.string().optional(),
  homeland: z.string().optional(),
  size: z.string().optional(),
  gender: z.string().optional(),
  age: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  classes: z.array(characterClassSchema).default([]),
  totalLevel: z.number().int().min(0).default(0),
});
export type CharacterIdentity = z.infer<typeof characterIdentitySchema>;

/** §6.2 Profile */
export const journalEntrySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  date: z.string().optional(),
  body: z.string().optional(),
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const characterProfileSchema = z.object({
  portraitUrl: z.string().optional(),
  tokenUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  quote: z.string().optional(),
  appearance: z
    .object({
      skin: z.string().optional(),
      hair: z.string().optional(),
      eyes: z.string().optional(),
      distinguishingFeatures: z.string().optional(),
      description: z.string().optional(),
    })
    .default({}),
  personality: z
    .object({
      description: z.string().optional(),
      likes: z.string().optional(),
      dislikes: z.string().optional(),
      ideals: z.string().optional(),
      flaws: z.string().optional(),
      phobias: z.string().optional(),
      uniqueTraits: z.string().optional(),
    })
    .default({}),
  backstory: z.string().optional(),
  family: z.string().optional(),
  allies: z.string().optional(),
  foes: z.string().optional(),
  affiliations: z.string().optional(),
  campaignJournal: z.array(journalEntrySchema).default([]),
});
export type CharacterProfile = z.infer<typeof characterProfileSchema>;

/** §6.12 Advancement */
export const characterProgressionSchema = z.object({
  currentXp: z.number().optional(),
  nextLevelXp: z.number().optional(),
  xpTrack: z.enum(["slow", "medium", "fast", "custom"]).optional(),
  favoredClasses: z.array(z.string()).default([]),
  levelPlan: z
    .array(
      z.object({
        level: z.number().int(),
        className: z.string().optional(),
        hitPoints: z.number().optional(),
        favoredClassBonus: z.string().optional(),
        abilityScoreIncrease: z.string().optional(),
        feats: z.array(z.string()).optional(),
        classFeatures: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
    )
    .default([]),
});
export type CharacterProgression = z.infer<typeof characterProgressionSchema>;
