import { z } from "zod";
import {
  automationEffectSchema,
  gmStatusSchema,
  resourceRefSchema,
  sourceRefSchema,
} from "./common";

/** §6.8 Feats */
export const featEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  source: sourceRefSchema.optional(),
  prerequisites: z.string().optional(),
  benefit: z.string().optional(),
  normal: z.string().optional(),
  special: z.string().optional(),
  chosenOptions: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).default([]),
  automation: z.array(automationEffectSchema).default([]),
  gmStatus: gmStatusSchema.optional(),
  showInCombat: z.boolean().optional(),
  notes: z.string().optional(),
});
export type FeatEntry = z.infer<typeof featEntrySchema>;

export const featBlockSchema = z.object({
  list: z.array(featEntrySchema).default([]),
});
export type FeatBlock = z.infer<typeof featBlockSchema>;

/** §6.9 Features (racial traits, class features, special abilities, etc.) */
export const featureCategorySchema = z.enum([
  "racial_trait",
  "class_feature",
  "archetype_feature",
  "special_ability",
  "defensive_feature",
  "offensive_feature",
  "misc",
]);
export type FeatureCategory = z.infer<typeof featureCategorySchema>;

export const featureEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: featureCategorySchema,
  source: sourceRefSchema.optional(),
  description: z.string().optional(),
  automation: z.array(automationEffectSchema).default([]),
  uses: resourceRefSchema.optional(),
  showInCombat: z.boolean().optional(),
  gmStatus: gmStatusSchema.optional(),
});
export type FeatureEntry = z.infer<typeof featureEntrySchema>;

export const featureBlockSchema = z.object({
  list: z.array(featureEntrySchema).default([]),
});
export type FeatureBlock = z.infer<typeof featureBlockSchema>;

/** Traits (character traits / drawbacks). */
export const traitEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  source: sourceRefSchema.optional(),
  description: z.string().optional(),
  automation: z.array(automationEffectSchema).default([]),
  gmStatus: gmStatusSchema.optional(),
});
export type TraitEntry = z.infer<typeof traitEntrySchema>;

export const traitBlockSchema = z.object({
  list: z.array(traitEntrySchema).default([]),
});
export type TraitBlock = z.infer<typeof traitBlockSchema>;
