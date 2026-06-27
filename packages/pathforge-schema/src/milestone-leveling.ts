import { z } from "zod";

/** §18 optional variant — Milestone Leveling. Replaces XP with cumulative "milestones." Each job/deed
 * grants milestones (scaled by job size), and you level up when your running total reaches the
 * threshold for the next level. Milestones are CUMULATIVE — they carry across level-ups, so the
 * threshold is a cumulative target (e.g. "3/8" = 3 earned, 8 needed to reach the next level). The exact
 * thresholds + job values are a house rule, so they're configurable. */

export const milestoneJobSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Milestones this job grants at the character's current level. */
  value: z.number().int().default(1),
});
export type MilestoneJob = z.infer<typeof milestoneJobSchema>;

export const milestoneLevelingBlockSchema = z.object({
  /** Cumulative milestones earned (never reset; carries across level-ups). */
  current: z.number().int().min(0).default(0),
  /** Cumulative milestones needed to reach the NEXT level (the threshold for the current level). */
  nextThreshold: z.number().int().min(0).default(1),
  /** Job/deed sizes and their milestone values at the current level (configurable per the house table). */
  jobs: z.array(milestoneJobSchema).default([]),
});
export type MilestoneLevelingBlock = z.infer<typeof milestoneLevelingBlockSchema>;

/** A sensible starting set of job sizes (values are placeholders — set them from your table). */
export const DEFAULT_MILESTONE_JOBS: Omit<MilestoneJob, "id">[] = [
  { label: "Small", value: 1 },
  { label: "Medium", value: 3 },
  { label: "Large", value: 5 },
];
