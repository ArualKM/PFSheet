import { z } from "zod";
import { privacyLevelSchema, resourceDefinitionSchema } from "./common";

/** §6 Languages */
export const languageBlockSchema = z.object({
  known: z.array(z.string()).default([]),
  bonusLanguageCount: z.number().int().optional(),
  notes: z.string().optional(),
});
export type LanguageBlock = z.infer<typeof languageBlockSchema>;

/** §6 Resources — custom trackable pools (ki, grit, panache, rage rounds…). */
export const resourceBlockSchema = z.object({
  list: z.array(resourceDefinitionSchema).default([]),
});
export type ResourceBlock = z.infer<typeof resourceBlockSchema>;

/** §15 Privacy — a map of section key -> privacy level. */
export const PRIVACY_SECTIONS = [
  "backstory",
  "privateNotes",
  "gmSecrets",
  "portrait",
  "inventory",
  "wealth",
  "spells",
  "formulaDetails",
  "buffs",
  "auditHistory",
  "journal",
] as const;
export const privacyBlockSchema = z.object({
  sections: z.record(z.string(), privacyLevelSchema).default({}),
  defaultLevel: privacyLevelSchema.default("private"),
});
export type PrivacyBlock = z.infer<typeof privacyBlockSchema>;

/** §6 Notes — free-form notes at varying visibility. */
export const notesBlockSchema = z.object({
  player: z.string().optional(),
  partyVisible: z.string().optional(),
  gmVisible: z.string().optional(),
  secrets: z.string().optional(),
  scratchpad: z.string().optional(),
});
export type NotesBlock = z.infer<typeof notesBlockSchema>;

/** §6 Character metadata. */
export const characterMetadataSchema = z.object({
  tags: z.array(z.string()).default([]),
  createdWith: z.string().default("pathforge"),
  importSource: z.string().optional(),
  /** Verbatim source fields an importer could not map. Never silently dropped. */
  unmapped: z.record(z.string(), z.unknown()).default({}),
  custom: z.record(z.string(), z.unknown()).default({}),
});
export type CharacterMetadata = z.infer<typeof characterMetadataSchema>;
