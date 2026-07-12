import { WIZARD_STEP_KEYS, type WizardStepKey } from "@pathforge/schema";
import type { CharacterEditorApi } from "../editor/use-character-editor";
import { WelcomeStep } from "./steps/welcome-step";
import { SystemsStep } from "./steps/systems-step";
import { RaceStep, canAdvanceRace } from "./steps/race-step";
import { ClassStep, canAdvanceClass } from "./steps/class-step";
import { AbilitiesStep, canAdvanceAbilities } from "./steps/abilities-step";
import { SkillsStep } from "./steps/skills-step";
import { FeatsStep } from "./steps/feats-step";
import { HpStep } from "./steps/hp-step";
import { GearStep } from "./steps/gear-step";
import { DetailsStep } from "./steps/details-step";
import { HandoffStep } from "./steps/handoff-step";
import type { WizardStepDef } from "./wizard-shell";

/**
 * The create-a-character wizard's step table — extracted verbatim out of `wizard-shell.tsx` (the
 * level-up wizard's Stage 2, `docs/LEVELUP_WIZARD/MASTER_PLAN.md` "Shell generalization design") so
 * the shell itself can drive ANY step sequence; a sibling `level-up-steps.ts` will build the level-up
 * wizard's own `WizardStepDef[]` later. Zero content change here: same labels/help/render/gates/
 * hints, same order (`WIZARD_STEP_KEYS`), no `visible` predicate on any entry — every create-wizard
 * step has always rendered in every session, and `character-wizard.tsx`'s own browser-verified flow
 * is the proof this extraction is behavior-identical.
 */

const STEP_LABELS: Record<WizardStepKey, string> = {
  welcome: "Welcome",
  systems: "Systems",
  abilities: "Abilities",
  race: "Race",
  class: "Class",
  skills: "Skills",
  feats: "Feats & Traits",
  hp: "Hit Points",
  gear: "Gear",
  details: "Details",
  done: "Finish",
};

// §4.3's one-line inline help per step (welcome/done render their own bespoke content instead).
const STEP_HELP: Record<WizardStepKey, string> = {
  welcome: "A quick tour before you start picking.",
  systems: "Optional rules your table plays with — these tailor the later steps.",
  abilities: "Ability scores govern nearly every roll your character makes.",
  race: "Race affects your ability scores, size, and speed.",
  class: "Your class is your role in the party — it sets HP, attack, and spells.",
  skills: 'Skills you’re trained in ("class skills") get a +3 bonus once you put a rank in them.',
  feats: "Feats and traits are the picks that make your build yours.",
  hp: "Your starting hit points — computed from class, level, and Constitution.",
  gear: "A rough starting-gold suggestion for your class, plus the full inventory editor.",
  details: "Flavor — alignment, deity, backstory. Come back to this anytime.",
  done: "Everything you picked is saved. Head into the full editor for the rest.",
};

const STEP_RENDER: Record<WizardStepKey, WizardStepDef["render"]> = {
  welcome: ({ ed, characterId }) => <WelcomeStep ed={ed} characterId={characterId} />,
  systems: ({ ed, characterId }) => <SystemsStep ed={ed} characterId={characterId} />,
  abilities: ({ ed, characterId }) => <AbilitiesStep ed={ed} characterId={characterId} />,
  race: ({ ed, characterId }) => <RaceStep ed={ed} characterId={characterId} />,
  class: ({ ed, characterId }) => <ClassStep ed={ed} characterId={characterId} />,
  skills: ({ ed, characterId }) => <SkillsStep ed={ed} characterId={characterId} />,
  feats: ({ ed, characterId }) => <FeatsStep ed={ed} characterId={characterId} />,
  hp: ({ ed, characterId }) => <HpStep ed={ed} characterId={characterId} />,
  gear: ({ ed, characterId }) => <GearStep ed={ed} characterId={characterId} />,
  details: ({ ed, characterId }) => <DetailsStep ed={ed} characterId={characterId} />,
  done: ({ ed, characterId }) => <HandoffStep ed={ed} characterId={characterId} />,
};

// Next-gates per doc §4.3 — only where the sheet would otherwise be nonsensical; Skip always works.
const STEP_GATES: Partial<Record<WizardStepKey, (ed: CharacterEditorApi) => boolean>> = {
  race: canAdvanceRace,
  class: canAdvanceClass,
  abilities: canAdvanceAbilities,
};

// ACTIONABLE copy for a failed gate — rendered as VISIBLE text next to the disabled Next button
// (a `title` tooltip never reaches anyone: `disabled:pointer-events-none` suppresses hover, and
// touch/screen-reader users have no hover at all — a confirmed review finding).
const STEP_GATE_HINTS: Partial<Record<WizardStepKey, string>> = {
  race: "Apply a race to continue — or Skip if you'd rather decide later.",
  class: "Add a class to continue — search above, pick one, then Apply. Or Skip for now.",
  abilities: "You're over the point-buy budget — lower a score to continue, or Skip.",
};

export const CREATE_WIZARD_STEPS: WizardStepDef[] = WIZARD_STEP_KEYS.map((key) => ({
  key,
  label: STEP_LABELS[key],
  help: STEP_HELP[key],
  skippable: key !== "welcome" && key !== "done",
  canAdvance: STEP_GATES[key],
  gateHint: STEP_GATE_HINTS[key],
  render: STEP_RENDER[key],
}));
