import { z } from "zod";

/** §6.3 Abilities — supports the six core scores plus custom/secondary scores. */
export const abilityScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number().int(),
  baseScore: z.number().int().optional(),
  enhancement: z.number().int().optional(),
  inherent: z.number().int().optional(),
  drain: z.number().int().optional(),
  damage: z.number().int().optional(),
  penalty: z.number().int().optional(),
  tempAdjust: z.number().int().optional(),
  formula: z.string().optional(),
  notes: z.string().optional(),
  /** Provenance: the pre-racial value last applied by the point-buy calculator. */
  pointBuyBase: z.number().int().optional(),
});
export type AbilityScore = z.infer<typeof abilityScoreSchema>;

/**
 * §6.3 Point-buy calculator state — optional, saved as part of the sheet so a build
 * can be retuned later. Point-buy governs the PRE-racial value; `score.score` is
 * recomposed as allocation + racial so a racial modifier never double-counts.
 */
export const pointBuyStateSchema = z.object({
  enabled: z.boolean().default(false),
  done: z.boolean().default(false),
  budget: z.number().int().default(15),
  /** "standard" PF1e table; "custom" reserved for variant/3pp tables. */
  system: z.enum(["standard", "custom"]).default("standard"),
  minScore: z.number().int().default(7),
  maxScore: z.number().int().default(18),
  /** ability key → chosen pre-racial score (7–18). */
  allocations: z.record(z.string(), z.number().int()).default({}),
  /** ability key → declared racial/other permanent modifier. */
  racial: z.record(z.string(), z.number().int()).default({}),
});
export type PointBuyState = z.infer<typeof pointBuyStateSchema>;

/**
 * Core PF1e Ability Score Increase: +1 to one ability of the player's choice at character levels 4,
 * 8, 12, 16, and 20 — cumulative, untyped (RAW: a permanent addition to the score, not a competing
 * "bonus"). One entry per increase taken. Mirrors `mythicAbilityBoostSchema`
 * (`./mythic.ts:32` — `{ id, tier, ability }`) exactly, minus the mythic-specific `tier` field and
 * with `level` (the character level it was taken at) in its place — `level` is bookkeeping only,
 * never enforced or re-derived from; the array's LENGTH is what the level-up wizard budgets against.
 * Unlike the mythic version, this is CORE PF1e — always-on, no `isModuleKeyEnabled` gate anywhere
 * this is read (see `packages/pathforge-rules-pf1e/src/compute.ts`'s ASI loop). `.default([])`
 * backfills every pre-existing sheet; `factory.ts` needs no edit (its draft is parsed through
 * `pathForgeCharacterV1Schema.parse`, which applies the default).
 */
export const abilityIncreaseSchema = z.object({
  id: z.string(),
  /** The character level this increase was taken at — bookkeeping only, not enforced. */
  level: z.number().int(),
  /** Which ability the +1 was assigned to (free string, like the mythic boost's `ability`). */
  ability: z.string(),
});
export type AbilityIncrease = z.infer<typeof abilityIncreaseSchema>;

/**
 * The six core PF1e abilities are required and exhaustive (a `z.record` keyed by
 * an enum is only partial in Zod, which would let a character validate with
 * missing scores). Secondary/custom scores live in `custom`.
 */
export const abilityBlockSchema = z.object({
  primary: z.object({
    str: abilityScoreSchema,
    dex: abilityScoreSchema,
    con: abilityScoreSchema,
    int: abilityScoreSchema,
    wis: abilityScoreSchema,
    cha: abilityScoreSchema,
  }),
  custom: z.record(z.string(), abilityScoreSchema).default({}),
  /** Optional point-buy calculator state (absent = manual entry, never used point-buy). */
  pointBuy: pointBuyStateSchema.optional(),
  /** Core Ability Score Increases (levels 4/8/12/16/20) — see `abilityIncreaseSchema`. */
  abilityIncreases: z.array(abilityIncreaseSchema).default([]),
});
export type AbilityBlock = z.infer<typeof abilityBlockSchema>;
