import { z } from "zod";
import { automationEffectSchema, durationSpecSchema, sourceRefSchema } from "./common";

/** §9 Buff Center */
export const buffCategorySchema = z.enum(["spell", "class_feature", "condition", "item", "custom"]);
export type BuffCategory = z.infer<typeof buffCategorySchema>;

export const buffTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: sourceRefSchema.optional(),
  description: z.string().optional(),
  category: buffCategorySchema.default("custom"),
  defaultDuration: durationSpecSchema.optional(),
  effects: z.array(automationEffectSchema).default([]),
  tags: z.array(z.string()).default([]),
});
export type BuffTemplate = z.infer<typeof buffTemplateSchema>;

export const activeBuffSchema = z.object({
  id: z.string(),
  templateId: z.string().optional(),
  name: z.string(),
  enabled: z.boolean().default(true),
  source: sourceRefSchema.optional(),
  category: buffCategorySchema.optional(),
  startedAt: z.string().optional(),
  duration: durationSpecSchema.optional(),
  remainingRounds: z.number().int().optional(),
  effects: z.array(automationEffectSchema).default([]),
  notes: z.string().optional(),
});
export type ActiveBuff = z.infer<typeof activeBuffSchema>;

export const buffBlockSchema = z.object({
  active: z.array(activeBuffSchema).default([]),
  templates: z.array(buffTemplateSchema).default([]),
});
export type BuffBlock = z.infer<typeof buffBlockSchema>;
