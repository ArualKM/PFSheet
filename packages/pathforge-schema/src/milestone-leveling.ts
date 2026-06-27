import { z } from "zod";

/** §18 optional variant — Milestone Leveling. Replaces XP with cumulative "milestones." Each job/deed
 * grants milestones (by job level × difficulty), and you level up when your running total reaches the
 * threshold for the next level. Milestones are CUMULATIVE — they carry across level-ups, so the
 * threshold is a cumulative target (e.g. "3/8" = 3 earned, 8 needed to reach the next level).
 *
 * The two house tables below are the campaign defaults. The current level is read from the character's
 * class level (`identity.totalLevel`); the milestone total tells you WHEN you've earned the next level. */

export const MILESTONE_DIFFICULTIES = ["easy", "medium", "hard", "deadly"] as const;
export type MilestoneDifficulty = (typeof MILESTONE_DIFFICULTIES)[number];

/** Cumulative milestones required to BE at each level (index = character level; 1-based). To reach the
 * NEXT level from level L, you need `MILESTONE_REQUIREMENTS[L + 1]` total milestones. */
export const MILESTONE_REQUIREMENTS: readonly number[] = [
  0, // 0 — unused (no level 0)
  0, // 1
  0, // 2
  0, // 3
  3, // 4
  8, // 5
  14, // 6
  21, // 7
  29, // 8
  39, // 9
  61, // 10
  85, // 11
  111, // 12
  141, // 13
  173, // 14
  207, // 15
  243, // 16
  303, // 17
  366, // 18
  432, // 19
  501, // 20
  576, // 21
];

/** Highest level the requirement ladder defines (a "next level" exists up to here). */
export const MILESTONE_MAX_LEVEL = MILESTONE_REQUIREMENTS.length - 1; // 21

/** Milestones rewarded for completing a job of a given level (index = job level; 1-based) at each
 * difficulty. Below level 3 every job is worth 0. */
export const MILESTONE_JOB_REWARDS: readonly Record<MilestoneDifficulty, number>[] = [
  { easy: 0, medium: 0, hard: 0, deadly: 0 }, // 0 — unused
  { easy: 0, medium: 0, hard: 0, deadly: 0 }, // 1
  { easy: 0, medium: 0, hard: 0, deadly: 0 }, // 2
  { easy: 1, medium: 3, hard: 4, deadly: 6 }, // 3
  { easy: 2, medium: 5, hard: 7, deadly: 10 }, // 4
  { easy: 3, medium: 6, hard: 9, deadly: 12 }, // 5
  { easy: 3, medium: 7, hard: 10, deadly: 14 }, // 6
  { easy: 4, medium: 8, hard: 12, deadly: 16 }, // 7
  { easy: 5, medium: 10, hard: 15, deadly: 20 }, // 8
  { easy: 5, medium: 11, hard: 16, deadly: 22 }, // 9
  { easy: 6, medium: 12, hard: 18, deadly: 24 }, // 10
  { easy: 6, medium: 13, hard: 19, deadly: 26 }, // 11
  { easy: 7, medium: 15, hard: 22, deadly: 30 }, // 12
  { easy: 8, medium: 16, hard: 24, deadly: 32 }, // 13
  { easy: 8, medium: 17, hard: 25, deadly: 34 }, // 14
  { easy: 9, medium: 18, hard: 27, deadly: 36 }, // 15
  { easy: 10, medium: 20, hard: 30, deadly: 40 }, // 16
  { easy: 10, medium: 21, hard: 31, deadly: 42 }, // 17
  { easy: 11, medium: 22, hard: 33, deadly: 44 }, // 18
  { easy: 11, medium: 23, hard: 34, deadly: 46 }, // 19
  { easy: 12, medium: 25, hard: 37, deadly: 50 }, // 20
];

/** Highest job level the reward matrix defines. */
export const MILESTONE_MAX_JOB_LEVEL = MILESTONE_JOB_REWARDS.length - 1; // 20

/** Cumulative milestones to BE at `level` (clamped to the table). */
export function milestoneRequirementForLevel(level: number): number {
  const lvl = Math.max(1, Math.min(MILESTONE_MAX_LEVEL, Math.floor(level)));
  return MILESTONE_REQUIREMENTS[lvl] ?? 0;
}

/** Milestones a `difficulty` job at `jobLevel` is worth (clamped to the matrix). */
export function milestoneJobReward(jobLevel: number, difficulty: MilestoneDifficulty): number {
  const lvl = Math.max(1, Math.min(MILESTONE_MAX_JOB_LEVEL, Math.floor(jobLevel)));
  return MILESTONE_JOB_REWARDS[lvl]?.[difficulty] ?? 0;
}

export const milestoneJobLogEntrySchema = z.object({
  id: z.string(),
  jobLevel: z.number().int(),
  difficulty: z.enum(MILESTONE_DIFFICULTIES),
  /** Milestones granted (recorded so the total stays correct even if the tables are ever revised). */
  value: z.number().int(),
});
export type MilestoneJobLogEntry = z.infer<typeof milestoneJobLogEntrySchema>;

export const milestoneLevelingBlockSchema = z.object({
  /** Cumulative milestones earned (never reset; carries across level-ups). */
  current: z.number().int().min(0).default(0),
  /** Recent jobs, newest first (for review + undo). */
  log: z.array(milestoneJobLogEntrySchema).default([]),
});
export type MilestoneLevelingBlock = z.infer<typeof milestoneLevelingBlockSchema>;
