import { z } from "zod";
import { sourceRefSchema } from "./common";

/** §6.1 Identity */
export const characterClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  archetype: z.string().optional(),
  level: z.number().int().min(0),
  hitDie: z.string().optional(),
  favoredClass: z.boolean().optional(),
  /** Links a row to its CLASS_CATALOG preset so BAB/saves/HP can recompute from classes. */
  presetKey: z.string().optional(),
  source: sourceRefSchema.optional(),
});
export type CharacterClass = z.infer<typeof characterClassSchema>;

export const characterIdentitySchema = z.object({
  name: z.string().default("New Character"),
  playerName: z.string().optional(),
  alignment: z.string().optional(),
  race: z.string().optional(),
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
