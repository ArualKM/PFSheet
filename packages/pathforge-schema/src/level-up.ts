import { z } from "zod";
import type { PathForgeCharacterV1 } from "./character";

/**
 * Level-up wizard — the per-character progress flag (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The
 * flag design"). Same shape family as `wizard.ts`'s create-wizard flag, but deliberately a
 * SEPARATE, independently-versioned module — NOT a generalization of the two into one polymorphic
 * bag. The two flags' shapes already diverge on day one (level-up needs `fromLevel`/`targetLevel`/
 * `startingMaxHp`, which the create wizard never needed), and sharing one `order`/`*_ORDER_VERSION`
 * would let a future create-wizard reorder accidentally invalidate an in-flight level-up checkpoint,
 * or vice versa — two small, independent modules is lower-risk than one generic one two features
 * immediately need to diverge from.
 *
 * Lives entirely inside the existing free-form `metadata.custom` bag (`z.record(z.string(),
 * z.unknown())` — see `./meta.ts`), so this module is purely an OPTIONAL parse/write helper: zero
 * schema changes to the canonical character shape, zero DB migration. A character that never
 * started a level-up session simply never has this key.
 */
export const LEVEL_UP_STEP_KEYS = [
  "class", // level an existing class / add a new one / prestige
  "hp", // reuses hp-step.tsx's HpStep verbatim (incl. FCB)
  "skills", // reuses skills-step.tsx's SkillsStep verbatim
  "feats", // visible only when the odd-level feat formula owes at least one pick
  "asi", // visible only when a level-4/8/12/16/20 boundary was crossed
  "spells", // visible only for casters
  "review", // summary + Finish
] as const;
export type LevelUpStepKey = (typeof LEVEL_UP_STEP_KEYS)[number];

/** Bumped whenever LEVEL_UP_STEP_KEYS gains steps or reorders — see `resumeLevelUpStepFor`. Nothing
 * older than v1 exists yet (this is the flag's first version, Stage 1), but the guard is here from
 * day one: a future reorder must not silently strand an in-flight session the way an unversioned
 * resume would (mirrors `WIZARD_ORDER_VERSION`'s reasoning for the create wizard). */
export const LEVEL_UP_ORDER_VERSION = 1;

export const levelUpMetaSchema = z.object({
  /** True while the level-up shell should be shown instead of the full editor. */
  active: z.boolean(),
  step: z.enum(LEVEL_UP_STEP_KEYS),
  /** Character level when this session STARTED — the baseline every gate/budget diffs against. */
  fromLevel: z.number().int(),
  /** Character level this session is walking the player to. May be > fromLevel + 1 — a returning
   * player catching up after missing sessions walks through every milestone crossed, not just the
   * final target. */
  targetLevel: z.number().int(),
  /** Max HP at fromLevel — lets the HP step show a "+7 this level-up" delta instead of just a total. */
  startingMaxHp: z.number().int().optional(),
  /** Snapshot of `identity.classes` (id/name/level) at session START, written once by the entry
   * action (Stage 7). `fromLevel` alone can't attribute gained levels to INDIVIDUAL classes in a
   * multiclass catch-up — a 3→7 session might raise one class by all 4 levels, or split unevenly
   * across two — so the Skills step's "ranks gained" diff and the Review step's before/after both
   * need this per-class baseline instead. Optional: absent for an in-flight session started before
   * this field existed, or read defensively outside an active session — every reader treats absence
   * as "no baseline, don't guess" (never re-derived by comparing against the CURRENT class list,
   * which has already changed by the time a mid-session step reads it). */
  startingClasses: z.array(z.object({ id: z.string(), name: z.string(), level: z.number().int() })).optional(),
  /** ISO timestamp. */
  startedAt: z.string(),
  /** ISO timestamp, set on handoff (the review step's Finish). */
  completedAt: z.string().optional(),
  /** LEVEL_UP_ORDER_VERSION at last write; absent = pre-versioning (shouldn't occur in practice —
   * every write re-stamps it — but resumed conservatively regardless, see resumeLevelUpStepFor). */
  order: z.number().optional(),
});
export type LevelUpMeta = z.infer<typeof levelUpMetaSchema>;

/**
 * Safe-parse `character.metadata.custom.levelUp`. Returns `null` for any character that never
 * started a level-up session (every pre-existing and every imported character) — never throws,
 * never assumes a default `active: true`. Callers must treat `null` as "not leveling up." Mirrors
 * `readWizardMeta`.
 */
export function readLevelUpMeta(character: PathForgeCharacterV1): LevelUpMeta | null {
  const raw = character.metadata?.custom?.levelUp;
  if (raw === undefined) return null;
  const parsed = levelUpMetaSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Merge a partial patch into `character.metadata.custom.levelUp`, mutating the passed character in
 * place (mirrors the `ed.update(mutate)` convention every other sheet mutation uses, same as
 * `writeWizardMeta`) and returning the resulting `LevelUpMeta`. Missing fields fall back to the
 * current value, or — on the very first write — a default.
 *
 * Unlike `writeWizardMeta` (which defaults a fresh `active: true`, because the create wizard's only
 * writer IS "start/resume the wizard"), a fresh `writeLevelUpMeta` call defaults `active: false`.
 * The level-up flag has more than one plausible caller shape long-term (a step writing its own
 * progress vs. the entry action starting a session), so silently activating the shell from an
 * unrelated first-touch patch would be a real footgun — `startLevelUpAction` (the only intended way
 * to BEGIN a session) always passes `active: true` explicitly. Likewise `fromLevel`/`targetLevel`
 * have no sane real default — there is no "safe" level — so an omitted-on-first-write value falls
 * back to the neutral `0`, a visibly-wrong placeholder a caller notices immediately, rather than
 * throwing and breaking the same merge-patch convention every other caller relies on.
 */
export function writeLevelUpMeta(character: PathForgeCharacterV1, patch: Partial<LevelUpMeta>): LevelUpMeta {
  const current = readLevelUpMeta(character);
  const next: LevelUpMeta = {
    active: false,
    step: "class",
    fromLevel: 0,
    targetLevel: 0,
    startedAt: new Date().toISOString(),
    ...current,
    ...patch,
    // Every write re-stamps the current order: once a session has navigated under the current
    // version, its checkpoints resume literally (resumeLevelUpStepFor).
    order: LEVEL_UP_ORDER_VERSION,
  };
  character.metadata.custom.levelUp = next;
  return next;
}

/**
 * Where a stored level-up checkpoint should actually RESUME, given which steps are visible for
 * THIS session (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "Conditional steps" — `feats`/`asi`/`spells`
 * come and go per-session, unlike the create wizard's always-11-steps shell). Pure: takes the
 * already-computed, in-canonical-order list of visible keys rather than an editor session, so only
 * the shell (which owns the `ed`-dependent visibility predicates) ever has to evaluate them.
 *
 * Contract:
 * 1. A checkpoint NOT stamped with the current `LEVEL_UP_ORDER_VERSION` resumes at the first visible
 *    step — conservative by construction. Nothing older than v1 exists yet (this is the flag's first
 *    version), but the guard exists from day one, mirroring `resumeStepFor`'s reasoning: a future
 *    reorder must not silently strand an in-flight session.
 * 2. Otherwise, find `meta.step`'s position in `LEVEL_UP_STEP_KEYS` and walk FORWARD to the first key
 *    at-or-after that position that's in `visibleKeys` — a step that's no longer visible (e.g. the
 *    player removed the class that made ASI eligible) is skipped rather than resuming on an
 *    empty/nonsensical panel; the step itself resumes literally when it's still visible.
 * 3. If nothing at-or-after the stored position is visible, resume at the LAST visible key — the
 *    session has effectively finished its guided portion, so land on Review.
 * 4. If `visibleKeys` is empty — shouldn't happen, `class` and `review` are always visible — fall
 *    back to `"class"` rather than throwing.
 */
export function resumeLevelUpStepFor(
  meta: LevelUpMeta,
  visibleKeys: readonly LevelUpStepKey[],
): LevelUpStepKey {
  if (visibleKeys.length === 0) return "class";
  if ((meta.order ?? 0) !== LEVEL_UP_ORDER_VERSION) return visibleKeys[0]!;

  const visible = new Set(visibleKeys);
  const startIndex = Math.max(0, LEVEL_UP_STEP_KEYS.indexOf(meta.step));
  for (let i = startIndex; i < LEVEL_UP_STEP_KEYS.length; i++) {
    const key = LEVEL_UP_STEP_KEYS[i]!;
    if (visible.has(key)) return key;
  }
  return visibleKeys[visibleKeys.length - 1]!;
}

/**
 * Core PF1e: a feat at 1st level and every ODD level thereafter (3, 5, 7, …) —
 * `Math.ceil(level / 2)` for `level >= 1`, else 0. Pure ADVISORY UI-hint math, same honesty as
 * `skillRanksForLevel` (`class-catalog.ts`): there is no engine-enforced `featBudget` anywhere
 * (Master Plan, Ground Truth), and class-granted bonus feats are already handled automatically by
 * `grantClassFeatures` — this formula is purely the core "any class" feat progression. The Feats
 * step's visibility/count badge diffs two calls
 * (`featsOwedAtLevel(targetLevel) - featsOwedAtLevel(fromLevel)`) so a multi-level catch-up sums
 * every odd level crossed in ONE pass, not per-level UI.
 */
export function featsOwedAtLevel(level: number): number {
  return level >= 1 ? Math.ceil(level / 2) : 0;
}

/**
 * Core PF1e: an ability score increase at levels 4, 8, 12, 16, and 20 — `Math.floor(level / 4)`,
 * floored at 0. Same advisory-only status as `featsOwedAtLevel` (no engine enforcement of a "count
 * available" budget — the engine only applies whatever `abilities.abilityIncreases` already holds).
 * Diffed the same way for the ASI step's visibility/count badge.
 */
export function asiCountAtLevel(level: number): number {
  return Math.max(0, Math.floor(level / 4));
}
