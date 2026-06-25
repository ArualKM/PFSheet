import { z } from "zod";

/**
 * §18 Rules block. Tracks which rule modules and variant systems a character has
 * enabled, plus per-module settings and house-rule notes.
 */
export const enabledModuleSchema = z.object({
  key: z.string(),
  version: z.string().optional(),
  enabled: z.boolean().default(true),
  settings: z.record(z.string(), z.unknown()).default({}),
  fromCampaign: z.boolean().optional(),
});
export type EnabledModule = z.infer<typeof enabledModuleSchema>;

export const rulesBlockSchema = z.object({
  coreModule: z.string().default("pf1e-core-default"),
  modules: z.array(enabledModuleSchema).default([]),
  /** Common variant toggles surfaced directly in the UI. */
  variants: z
    .object({
      fractionalBabSaves: z.boolean().optional(),
      backgroundSkills: z.boolean().optional(),
      woundsVigor: z.boolean().optional(),
      automaticBonusProgression: z.boolean().optional(),
      elephantInTheRoom: z.boolean().optional(),
      mythic: z.boolean().optional(),
    })
    .default({}),
  houseRules: z.string().optional(),
});
export type RulesBlock = z.infer<typeof rulesBlockSchema>;
