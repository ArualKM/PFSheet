import { z } from "zod";
import { modifierEntrySchema, sourceRefSchema } from "./common";

/** §6.7 Skills — modular, not hardcoded. */
export const skillEntrySchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  ability: z.string(),
  trainedOnly: z.boolean().optional(),
  armorCheckPenalty: z.boolean().optional(),
  classSkill: z.boolean().optional(),
  ranks: z.number().int().min(0).default(0),
  misc: z.array(modifierEntrySchema).default([]),
  conditional: z.array(modifierEntrySchema).default([]),
  formula: z.string().optional(),
  custom: z.boolean().optional(),
  /** For Craft/Perform/Profession/Knowledge — the chosen specialty. */
  specialty: z.string().optional(),
  total: z.number().int().optional(),
  source: sourceRefSchema.optional(),
});
export type SkillEntry = z.infer<typeof skillEntrySchema>;

export const skillBlockSchema = z.object({
  settings: z
    .object({
      backgroundSkillsEnabled: z.boolean().optional(),
      armorCheckPenaltyApplies: z.boolean().optional().default(true),
      classSkillBonusDefault: z.number().int().optional().default(3),
    })
    .default({}),
  list: z.array(skillEntrySchema).default([]),
});
export type SkillBlock = z.infer<typeof skillBlockSchema>;

/** Standard PF1e skill definitions (mechanics only, no rules text). */
export type DefaultSkillDef = {
  key: string;
  label: string;
  ability: "str" | "dex" | "con" | "int" | "wis" | "cha";
  trainedOnly?: boolean;
  armorCheckPenalty?: boolean;
  /** A skill that can be taken multiple times with a specialty. */
  repeatable?: boolean;
  /** Treated as a Background skill under the Background Skills variant. */
  background?: boolean;
};

export const DEFAULT_SKILLS: DefaultSkillDef[] = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex", armorCheckPenalty: true },
  { key: "appraise", label: "Appraise", ability: "int", background: true },
  { key: "bluff", label: "Bluff", ability: "cha" },
  { key: "climb", label: "Climb", ability: "str", armorCheckPenalty: true },
  { key: "craft", label: "Craft", ability: "int", repeatable: true, background: true },
  { key: "diplomacy", label: "Diplomacy", ability: "cha" },
  {
    key: "disable_device",
    label: "Disable Device",
    ability: "dex",
    trainedOnly: true,
    armorCheckPenalty: true,
  },
  { key: "disguise", label: "Disguise", ability: "cha" },
  { key: "escape_artist", label: "Escape Artist", ability: "dex", armorCheckPenalty: true },
  { key: "fly", label: "Fly", ability: "dex", armorCheckPenalty: true },
  { key: "handle_animal", label: "Handle Animal", ability: "cha", trainedOnly: true },
  { key: "heal", label: "Heal", ability: "wis" },
  { key: "intimidate", label: "Intimidate", ability: "cha" },
  { key: "knowledge_arcana", label: "Knowledge (Arcana)", ability: "int", trainedOnly: true },
  {
    key: "knowledge_dungeoneering",
    label: "Knowledge (Dungeoneering)",
    ability: "int",
    trainedOnly: true,
  },
  {
    key: "knowledge_engineering",
    label: "Knowledge (Engineering)",
    ability: "int",
    trainedOnly: true,
  },
  { key: "knowledge_geography", label: "Knowledge (Geography)", ability: "int", trainedOnly: true },
  { key: "knowledge_history", label: "Knowledge (History)", ability: "int", trainedOnly: true },
  { key: "knowledge_local", label: "Knowledge (Local)", ability: "int", trainedOnly: true },
  { key: "knowledge_nature", label: "Knowledge (Nature)", ability: "int", trainedOnly: true },
  { key: "knowledge_nobility", label: "Knowledge (Nobility)", ability: "int", trainedOnly: true },
  { key: "knowledge_planes", label: "Knowledge (Planes)", ability: "int", trainedOnly: true },
  { key: "knowledge_religion", label: "Knowledge (Religion)", ability: "int", trainedOnly: true },
  { key: "linguistics", label: "Linguistics", ability: "int", trainedOnly: true, background: true },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "perform", label: "Perform", ability: "cha", repeatable: true },
  {
    key: "profession",
    label: "Profession",
    ability: "wis",
    trainedOnly: true,
    repeatable: true,
    background: true,
  },
  { key: "ride", label: "Ride", ability: "dex", armorCheckPenalty: true },
  { key: "sense_motive", label: "Sense Motive", ability: "wis" },
  {
    key: "sleight_of_hand",
    label: "Sleight of Hand",
    ability: "dex",
    trainedOnly: true,
    armorCheckPenalty: true,
  },
  { key: "spellcraft", label: "Spellcraft", ability: "int", trainedOnly: true },
  { key: "stealth", label: "Stealth", ability: "dex", armorCheckPenalty: true },
  { key: "survival", label: "Survival", ability: "wis" },
  { key: "swim", label: "Swim", ability: "str", armorCheckPenalty: true },
  { key: "use_magic_device", label: "Use Magic Device", ability: "cha", trainedOnly: true },
];
