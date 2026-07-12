import { LEVEL_UP_STEP_KEYS, readLevelUpMeta, featsOwedAtLevel, asiCountAtLevel, type LevelUpStepKey } from "@pathforge/schema";
import type { CharacterEditorApi } from "../../editor/use-character-editor";
import { LevelUpClassStep, canAdvanceLevelUpClass } from "./class-step";
import { LevelUpHpStep } from "./hp-step";
import { LevelUpSkillsStep } from "./skills-step";
import { LevelUpFeatsStep } from "./feats-step";
import { LevelUpAsiStep } from "./asi-step";
import { LevelUpSpellsStep } from "./spells-step";
import { LevelUpReviewStep } from "./review-step";
import type { WizardStepDef } from "../wizard-shell";

/**
 * The level-up wizard's step table (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list" +
 * "Conditional steps") — the level-up sibling of `create-wizard-steps.tsx`, built the same way
 * (`LEVEL_UP_STEP_KEYS.map(...)`) but, unlike the create wizard, THREE entries carry a `visible`
 * predicate: `feats`/`asi`/`spells` come and go per-session depending on what this particular
 * level-up actually crosses. Every predicate is a pure read of `ed.draft`/`ed.computed` — no new
 * engine primitive, re-evaluated fresh every render by `WizardShell` (never frozen at session start),
 * so e.g. a multiclass dip into a caster on the Class step makes the Spells step appear later in the
 * SAME session without a restart.
 */

const STEP_LABELS: Record<LevelUpStepKey, string> = {
  class: "Class",
  hp: "Hit Points",
  skills: "Skills",
  feats: "Feats",
  asi: "Ability Score",
  spells: "Spells",
  review: "Review",
};

const STEP_HELP: Record<LevelUpStepKey, string> = {
  class: "Assign your new level(s) to a class you have, or pick up something new.",
  hp: "Update your hit points for the level(s) you just gained.",
  skills: "Spend the new skill ranks this level-up granted.",
  feats: "Pick the feat(s) this level-up owes you.",
  asi: "Increase an ability score — PF1e grants one at levels 4, 8, 12, 16, and 20.",
  spells: "New caster levels mean new spell slots — and, for some casters, new spells known.",
  review: "Review what changed, then finish.",
};

const STEP_RENDER: Record<LevelUpStepKey, WizardStepDef["render"]> = {
  class: ({ ed, characterId }) => <LevelUpClassStep ed={ed} characterId={characterId} />,
  hp: ({ ed, characterId }) => <LevelUpHpStep ed={ed} characterId={characterId} />,
  skills: ({ ed, characterId }) => <LevelUpSkillsStep ed={ed} characterId={characterId} />,
  feats: ({ ed, characterId }) => <LevelUpFeatsStep ed={ed} characterId={characterId} />,
  asi: ({ ed, characterId }) => <LevelUpAsiStep ed={ed} characterId={characterId} />,
  spells: ({ ed, characterId }) => <LevelUpSpellsStep ed={ed} characterId={characterId} />,
  review: ({ ed, characterId }) => <LevelUpReviewStep ed={ed} characterId={characterId} />,
};

// "Double-leveling" guard (Master Plan, "Risks"): the class step must land on EXACTLY targetLevel,
// not more or less — see canAdvanceLevelUpClass's gestalt-both-tracks form.
const STEP_GATES: Partial<Record<LevelUpStepKey, (ed: CharacterEditorApi) => boolean>> = {
  class: canAdvanceLevelUpClass,
};

// VISIBLE gate copy (never a title tooltip — unreachable on a disabled button for touch/SR users),
// same convention as create-wizard-steps.tsx's STEP_GATE_HINTS.
const STEP_GATE_HINTS: Partial<Record<LevelUpStepKey, string>> = {
  class: "Assign all your new levels to a class to continue — the step shows how many are left.",
};

// A step whose predicate reads meta must fail CLOSED (return false) when there's no active session
// to read — readLevelUpMeta already returns null defensively rather than throwing.
const STEP_VISIBLE: Partial<Record<LevelUpStepKey, (ed: CharacterEditorApi) => boolean>> = {
  feats: (ed) => {
    const meta = readLevelUpMeta(ed.draft);
    if (!meta) return false;
    return featsOwedAtLevel(meta.targetLevel) - featsOwedAtLevel(meta.fromLevel) > 0;
  },
  asi: (ed) => {
    const meta = readLevelUpMeta(ed.draft);
    if (!meta) return false;
    return asiCountAtLevel(meta.targetLevel) - asiCountAtLevel(meta.fromLevel) > 0;
  },
  // ed.computed.spellcasting is always an array (never undefined) — ComputedCharacter's top-level
  // field, not summary.spells (the compact dashboard roll-up, absent for non-casters).
  spells: (ed) => ed.computed.spellcasting.length > 0,
};

export const LEVEL_UP_STEPS: WizardStepDef[] = LEVEL_UP_STEP_KEYS.map((key) => ({
  key,
  label: STEP_LABELS[key],
  help: STEP_HELP[key],
  // Every step is always skippable (Master Plan: "Skip this step" is never gated, only Next is) —
  // review's own Finish handles the terminal action once Stage 7 replaces its placeholder; until
  // then WizardShell's `isLast` branch never renders a Skip button for it anyway.
  skippable: true,
  canAdvance: STEP_GATES[key],
  gateHint: STEP_GATE_HINTS[key],
  visible: STEP_VISIBLE[key],
  render: STEP_RENDER[key],
}));
