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

export const WIZARD_STEP_KEYS = [
  "welcome",
  "race",
  "class",
  "abilities",
  "skills",
  "gear",
  "details",
  "done",
] as const;
export type WizardStepKey = (typeof WIZARD_STEP_KEYS)[number];

export const wizardMetaSchema = z.object({
  /** True while the wizard shell should be shown instead of the full editor. */
  active: z.boolean(),
  step: z.enum(WIZARD_STEP_KEYS),
  /** ISO timestamp. */
  startedAt: z.string(),
  /** ISO timestamp, set on handoff (Finish). */
  completedAt: z.string().optional(),
});
export type WizardMeta = z.infer<typeof wizardMetaSchema>;

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
  };
  character.metadata.custom.wizard = next;
  return next;
}
