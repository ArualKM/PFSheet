import { z } from "zod";
import {
  characterIdentitySchema,
  characterProfileSchema,
  characterProgressionSchema,
} from "./identity";
import { abilityBlockSchema } from "./abilities";
import { defenseBlockSchema, healthBlockSchema, sensesBlockSchema } from "./vitals";
import { combatBlockSchema } from "./combat";
import { skillBlockSchema } from "./skills";
import { featBlockSchema, featureBlockSchema, traitBlockSchema } from "./feats";
import { spellcastingBlockSchema } from "./spellcasting";
import { inventoryBlockSchema, wealthBlockSchema } from "./inventory";
import { buffBlockSchema } from "./buffs";
import { formulaBlockSchema } from "./formulas";
import { rulesBlockSchema } from "./rules";
import { heroPointsBlockSchema } from "./hero-points";
import { honorBlockSchema } from "./honor";
import { staminaBlockSchema } from "./stamina";
import { mythicBlockSchema } from "./mythic";
import { psionicsBlockSchema } from "./psionics";
import {
  characterMetadataSchema,
  languageBlockSchema,
  notesBlockSchema,
  privacyBlockSchema,
  resourceBlockSchema,
} from "./meta";

export const CHARACTER_SCHEMA_VERSION = "pathforge-character-v1" as const;

/**
 * §6 The canonical PathForge PF1e character document. One JSON document,
 * schema-versioned, intentionally flexible because PF1e is deeply customizable.
 */
export const pathForgeCharacterV1Schema = z.object({
  schemaVersion: z.literal(CHARACTER_SCHEMA_VERSION),
  system: z.literal("pf1e"),
  identity: characterIdentitySchema,
  profile: characterProfileSchema,
  progression: characterProgressionSchema,
  abilities: abilityBlockSchema,
  health: healthBlockSchema,
  defenses: defenseBlockSchema,
  combat: combatBlockSchema,
  skills: skillBlockSchema,
  feats: featBlockSchema,
  traits: traitBlockSchema,
  features: featureBlockSchema,
  spellcasting: spellcastingBlockSchema,
  inventory: inventoryBlockSchema,
  wealth: wealthBlockSchema,
  senses: sensesBlockSchema,
  languages: languageBlockSchema,
  resources: resourceBlockSchema,
  buffs: buffBlockSchema,
  formulas: formulaBlockSchema,
  rules: rulesBlockSchema,
  /** Optional rule subsystems (§18) — present only when the character enables the module. */
  heroPoints: heroPointsBlockSchema.optional(),
  honor: honorBlockSchema.optional(),
  stamina: staminaBlockSchema.optional(),
  mythic: mythicBlockSchema.optional(),
  psionics: psionicsBlockSchema.optional(),
  privacy: privacyBlockSchema,
  notes: notesBlockSchema,
  metadata: characterMetadataSchema,
});

export type PathForgeCharacterV1 = z.infer<typeof pathForgeCharacterV1Schema>;
