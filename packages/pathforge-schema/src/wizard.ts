import { z } from "zod";
import type { PathForgeCharacterV1 } from "./character";

/**
 * S6 Pillar 3 — the create-a-character wizard's per-character progress flag
 * (`docs/S6_UX_OVERHAUL/03_CHARACTER_WIZARD.md` §3a). Lives entirely inside the existing free-form
 * `metadata.custom` bag (`z.record(z.string(), z.unknown())` — see `./meta.ts`), so this module is
 * purely an OPTIONAL parse/write helper: zero schema changes to the canonical character shape, zero
 * DB migration. An imported/legacy character simply never has this key — `readWizardMeta` returns
 * `null` for it, never a fabricated default.
 */

/** Wizard v2 order (owner-specified, 2026-07-10): systems first (gestalt/background-skills reshape
 * the later steps), then abilities BEFORE race — applying a race after point-buy is enabled rides
 * `RacePicker`'s existing pointBuy.racial mirror, so racial mods stack on the allocated array
 * instead of being baked into the baseline. Every v1 key keeps its name, so a mid-wizard sheet
 * stored under the old order resumes at the same-named step's new position. */
export const WIZARD_STEP_KEYS = [
  "welcome",
  "systems",
  "abilities",
  "race",
  "class",
  "skills",
  "feats",
  "hp",
  "gear",
  "details",
  "done",
] as const;
export type WizardStepKey = (typeof WIZARD_STEP_KEYS)[number];

/** Bumped whenever WIZARD_STEP_KEYS gains steps or reorders — a checkpoint stamped with an OLDER
 * order (or none, i.e. v1) can't resume by raw key: steps inserted BEFORE its position would be
 * silently skipped forever (the shell only walks forward). See `resumeStepFor`. */
export const WIZARD_ORDER_VERSION = 2;

export const wizardMetaSchema = z.object({
  /** True while the wizard shell should be shown instead of the full editor. */
  active: z.boolean(),
  step: z.enum(WIZARD_STEP_KEYS),
  /** ISO timestamp. */
  startedAt: z.string(),
  /** ISO timestamp, set on handoff (Finish). */
  completedAt: z.string().optional(),
  /** WIZARD_ORDER_VERSION at last write; absent = v1 (pre-reorder). */
  order: z.number().optional(),
});
export type WizardMeta = z.infer<typeof wizardMetaSchema>;

/**
 * Where a stored checkpoint should actually RESUME. A checkpoint written under the CURRENT order
 * resumes at its own step. A v1 checkpoint (no/older `order` stamp) mid-flow resumes at "systems" —
 * the earliest v2-inserted step — because under v1's order (welcome, race, class, abilities, …)
 * every non-bookend position now has unvisited steps BEFORE it (Systems always; Abilities for
 * race/class checkpoints). Nothing is lost: their picks are on the sheet and each step renders
 * current state, so walking forward re-reviews rather than redoes. Bookends stay put.
 */
export function resumeStepFor(meta: WizardMeta): WizardStepKey {
  if ((meta.order ?? 1) >= WIZARD_ORDER_VERSION) return meta.step;
  return meta.step === "welcome" || meta.step === "done" ? meta.step : "systems";
}

/**
 * Safe-parse `character.metadata.custom.wizard`. Returns `null` for any character that never went
 * through the wizard (every pre-existing and every imported character) — never throws, never
 * assumes a default `active: true`. Callers must treat `null` as "not in the wizard."
 */
export function readWizardMeta(character: PathForgeCharacterV1): WizardMeta | null {
  const raw = character.metadata?.custom?.wizard;
  if (raw === undefined) return null;
  const parsed = wizardMetaSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Merge a partial patch into `character.metadata.custom.wizard`, mutating the passed character in
 * place (mirrors the `ed.update(mutate)` convention every other sheet mutation uses) and returning
 * the resulting `WizardMeta`. Missing fields fall back to the current value, or — on the very first
 * write — a sane default (`active: true`, `step: "welcome"`, `startedAt: now`) so the result is
 * always a schema-valid `WizardMeta`.
 */
export function writeWizardMeta(character: PathForgeCharacterV1, patch: Partial<WizardMeta>): WizardMeta {
  const current = readWizardMeta(character);
  const next: WizardMeta = {
    active: true,
    step: "welcome",
    startedAt: new Date().toISOString(),
    ...current,
    ...patch,
    // Every write re-stamps the current order: once a session has navigated under v2, its
    // checkpoints resume literally (resumeStepFor).
    order: WIZARD_ORDER_VERSION,
  };
  character.metadata.custom.wizard = next;
  return next;
}
