import type { LevelUpMeta, PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * Level-Up Wizard Stage 7 — the pure meta-stamping DECISION behind `startLevelUpAction`
 * (`lib/actions/characters.ts`). Extracted into its own file so it's unit-testable without faking
 * that action's RLS-scoped Supabase server client / `next/navigation`'s throwing `redirect()` — no
 * existing test in this repo fakes that preamble (checked: nothing under `tests/unit` imports
 * `lib/actions/*` or `lib/supabase/server`/`next/headers`), unlike the import-apply tests, which fake
 * a plain PostgREST-shaped client around a pure business-logic module, not a live server action. This
 * mirrors that same shape: `startLevelUpAction` stays a thin IO wrapper; the interesting decision
 * (what the fresh session's baseline should be) lives here, plainly testable.
 */

/**
 * Build the `writeLevelUpMeta` patch for STARTING a brand-new level-up session — never for
 * resuming one (`startLevelUpAction` only calls this on its "no active session of either kind"
 * branch; an in-flight session's `fromLevel`/`targetLevel`/`startingClasses` must never be
 * re-stamped, or a player already mid-session would have their baseline silently corrupted).
 *
 * `completedAt: undefined` is passed EXPLICITLY, not omitted. `writeLevelUpMeta`'s merge is
 * `{ ...defaults, ...current, ...patch }` — a prior FINISHED session's `completedAt` timestamp
 * would otherwise survive the spread into this fresh session (clicking "Level Up" again after
 * finishing one would look already-completed the instant it started). A JS object spread DOES let
 * a later explicit `key: undefined` win over an earlier key with a real value — verified by this
 * module's own test (`tests/unit/level-up-actions.test.ts`), not just asserted in a comment.
 */
export function buildStartLevelUpMeta(
  character: PathForgeCharacterV1,
  computedMaxHp: number | undefined,
): Partial<LevelUpMeta> {
  const fromLevel = character.identity.totalLevel;
  return {
    active: true,
    step: "class",
    fromLevel,
    targetLevel: fromLevel + 1,
    // Guard against a non-finite compute result (NaN/Infinity) rather than stamping a nonsense
    // baseline the HP step's delta line would render as "NaN this level-up".
    startingMaxHp: Number.isFinite(computedMaxHp) ? (computedMaxHp as number) : undefined,
    startingClasses: character.identity.classes.map((cl) => ({
      id: cl.id,
      name: cl.compendiumPreset?.name ?? cl.name,
      level: cl.level,
    })),
    startedAt: new Date().toISOString(),
    completedAt: undefined,
  };
}
