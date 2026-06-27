import { z } from "zod";

/** §18 optional subsystem — Hero Points (APG / Ultimate Campaign). A tiny luck pool spent for
 * rerolls, +8 bonuses, extra actions, or cheating death. Points do NOT renew on rest — they are
 * permanently spent and regained only via awards / leveling (so the pool uses `per: "custom"`). */

export const HERO_POINT_SPEND_KINDS = [
  "bonus", // +8 to a roll (or +4 after rolling)
  "extra_action", // an additional standard or move action
  "inspiration", // act as if you had a relevant skill/feat
  "recall", // recall the last thing you knew
  "reroll", // reroll a d20
  "cheat_death", // survive a fatal blow
  "special", // an ability or item that costs a hero point
  "award", // GM grants points (positive delta)
  "other",
] as const;

export const heroPointLogEntrySchema = z.object({
  id: z.string(),
  /** Negative = spent, positive = awarded. */
  delta: z.number().int(),
  kind: z.enum(HERO_POINT_SPEND_KINDS).default("other"),
  reason: z.string().optional(),
});
export type HeroPointLogEntry = z.infer<typeof heroPointLogEntrySchema>;

export const heroPointsBlockSchema = z.object({
  current: z.number().int().min(0).default(1),
  /** Hero's Fortune feat: +1 to the maximum hero points. */
  heroesFortune: z.boolean().optional(),
  /** Other sources (mythic, traits, house rules) that raise the cap. */
  bonusMax: z.number().int().default(0),
  log: z.array(heroPointLogEntrySchema).default([]),
});
export type HeroPointsBlock = z.infer<typeof heroPointsBlockSchema>;

/** The standard hero-point maximum is 3, +1 from Hero's Fortune, plus any other bonus. */
export function maxHeroPoints(block: { heroesFortune?: boolean; bonusMax?: number }): number {
  return 3 + (block.heroesFortune ? 1 : 0) + (block.bonusMax ?? 0);
}
