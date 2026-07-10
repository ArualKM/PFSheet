"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { WIZARD_STEP_KEYS, writeWizardMeta, type WizardStepKey } from "@pathforge/schema";
import { useShouldAnimate } from "@/components/motion/use-should-animate";
import { pfDurFast, pfEase } from "@/components/motion/tokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CharacterEditorApi, SaveStatus } from "../editor/use-character-editor";
// From its own tiny module — importing it from character-editor.tsx pulls the whole ~5,400-line
// editor graph (~1.2MB) into the wizard bundle (a confirmed review finding).
import { SaveStatusBadge } from "../editor/save-status-badge";
import { ConflictResolver } from "../editor/conflict-resolver";
import { WelcomeStep } from "./steps/welcome-step";
import { RaceStep, canAdvanceRace } from "./steps/race-step";
import { ClassStep, canAdvanceClass } from "./steps/class-step";
import { AbilitiesStep, canAdvanceAbilities } from "./steps/abilities-step";
import { SkillsStep } from "./steps/skills-step";
import { GearStep } from "./steps/gear-step";
import { DetailsStep } from "./steps/details-step";
import { HandoffStep } from "./steps/handoff-step";

/**
 * S6 Pillar 3 §4.2 step shell. This slice (W1) ships the spine + navigation + TWO real steps
 * (welcome, done/handoff); the six middle steps render an honest placeholder panel so the flow is
 * walkable end-to-end and the next slice can drop each real step's panel in without touching this
 * file's navigation/spine/animation machinery.
 */

const STEP_LABELS: Record<WizardStepKey, string> = {
  welcome: "Welcome",
  race: "Race",
  class: "Class",
  abilities: "Abilities",
  skills: "Skills",
  gear: "Gear",
  details: "Details",
  done: "Finish",
};

// §4.3's one-line inline help per step — used by the placeholder panel for the six steps this
// slice doesn't build yet (welcome/done render their own bespoke content instead).
const STEP_HELP: Record<WizardStepKey, string> = {
  welcome: "A quick tour before you start picking.",
  race: "Race affects your ability scores, size, and speed.",
  class: "Your class is your role in the party — it sets HP, attack, and spells.",
  abilities: "Ability scores govern nearly every roll your character makes.",
  skills: 'Skills you’re trained in ("class skills") get a +3 bonus once you put a rank in them.',
  gear: "A rough starting-gold suggestion for your class, plus the full inventory editor.",
  details: "Flavor — alignment, deity, backstory. Come back to this anytime.",
  done: "Everything you picked is saved. Head into the full editor for the rest.",
};

type WizardStepProps = { ed: CharacterEditorApi; characterId: string };

type WizardStepDef = {
  key: WizardStepKey;
  label: string;
  help: string;
  /** Whether "Skip this step" is offered — not the welcome/done bookends. */
  skippable: boolean;
  /** Optional Next gate — disables Next (never Skip) until the step's pick is coherent, using the
   *  same engine predicates the editors use (doc §7: never invent new ones). */
  canAdvance?: (ed: CharacterEditorApi) => boolean;
  render: (props: WizardStepProps) => ReactNode;
};

const STEP_RENDER: Record<WizardStepKey, (props: WizardStepProps) => ReactNode> = {
  welcome: ({ ed, characterId }) => <WelcomeStep ed={ed} characterId={characterId} />,
  race: ({ ed, characterId }) => <RaceStep ed={ed} characterId={characterId} />,
  class: ({ ed, characterId }) => <ClassStep ed={ed} characterId={characterId} />,
  abilities: ({ ed, characterId }) => <AbilitiesStep ed={ed} characterId={characterId} />,
  skills: ({ ed, characterId }) => <SkillsStep ed={ed} characterId={characterId} />,
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

const STEPS: WizardStepDef[] = WIZARD_STEP_KEYS.map((key) => ({
  key,
  label: STEP_LABELS[key],
  help: STEP_HELP[key],
  skippable: key !== "welcome" && key !== "done",
  canAdvance: STEP_GATES[key],
  render: STEP_RENDER[key],
}));

export function WizardShell({
  ed,
  characterId,
  initialStep,
}: {
  ed: CharacterEditorApi;
  characterId: string;
  initialStep: WizardStepKey;
}) {
  const initialIndex = Math.max(0, WIZARD_STEP_KEYS.indexOf(initialStep));
  const [stepIndex, setStepIndex] = useState(initialIndex);
  const shouldAnimate = useShouldAnimate();

  const current = STEPS[stepIndex]!;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  // Every advance/back/skip mirrors stepIndex into metadata.custom.wizard.step (via ed.update, so
  // it rides the existing save loop/undo/3-way-merge for free) — a refresh mid-wizard resumes here.
  const goTo = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, nextIndex));
    const key = STEPS[clamped]!.key;
    setStepIndex(clamped);
    ed.update((c) => {
      writeWizardMeta(c, { step: key });
    });
  };

  // Entrance tracking, the editor-canvas.tsx idiom (adjust-state-during-render): the FIRST render
  // is at rest (no entrance replay on initial mount / resumed step), every later step change plays
  // it. No AnimatePresence exit — step panels hold interactive form state, and an exiting sibling's
  // props freeze mid-unmount (see docs/S6_UX_OVERHAUL/ANIMATION_SYSTEM.md).
  const [prevKey, setPrevKey] = useState(current.key);
  const [hasChanged, setHasChanged] = useState(false);
  if (prevKey !== current.key) {
    setPrevKey(current.key);
    if (!hasChanged) setHasChanged(true);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <MobileSpine stepIndex={stepIndex} status={ed.status} error={ed.error} />

      <div className="flex flex-col gap-6 py-4 lg:flex-row lg:items-start lg:gap-8 lg:py-6">
        <DesktopSpine stepIndex={stepIndex} status={ed.status} error={ed.error} />

        <div className="min-w-0 flex-1 space-y-5">
          {/* A true concurrent-edit collision needs the same resolver the full editor shows — a
              wizard with no conflict UI would silently strand the unsaved merge in memory (and the
              exit/finish flows hold navigation while a conflict is open). */}
          {ed.conflict && (
            <ConflictResolver
              merged={ed.conflict.merged}
              conflicts={ed.conflict.conflicts}
              serverSheet={ed.conflict.serverSheet}
              onResolve={ed.resolveConflict}
            />
          )}

          <motion.div
            key={current.key}
            initial={shouldAnimate && hasChanged ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: pfDurFast, ease: pfEase }}
          >
            <fieldset
              disabled={ed.status === "conflict"}
              className={cn("m-0 min-w-0 border-0 p-0", ed.status === "conflict" && "opacity-60")}
            >
              {current.render({ ed, characterId })}
            </fieldset>
          </motion.div>

          <WizardFooter
            isFirst={isFirst}
            isLast={isLast}
            skippable={current.skippable}
            locked={ed.status === "conflict"}
            gateSatisfied={current.canAdvance ? current.canAdvance(ed) : true}
            gateHint={STEP_GATE_HINTS[current.key]}
            onBack={() => goTo(stepIndex - 1)}
            onSkip={() => goTo(stepIndex + 1)}
            onNext={() => goTo(stepIndex + 1)}
          />
        </div>
      </div>
    </div>
  );
}

function WizardFooter({
  isFirst,
  isLast,
  skippable,
  locked,
  gateSatisfied,
  gateHint,
  onBack,
  onSkip,
  onNext,
}: {
  isFirst: boolean;
  isLast: boolean;
  skippable: boolean;
  /** True while a sync conflict is open — navigation waits for the resolver, like the editor's pill. */
  locked: boolean;
  /** The step's Next-gate result (true when the step has no gate). Skip is NEVER gated. */
  gateSatisfied: boolean;
  gateHint?: string;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  const lockTitle = locked ? "Resolve the sync conflict first" : undefined;
  if (isLast) {
    // The Handoff panel owns the primary "Finish" CTA itself (it needs to gate on ed.status before
    // navigating) — the footer here just offers a way back to fix something, no redundant second
    // Finish button.
    return (
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onBack} disabled={locked} title={lockTitle} className="min-h-11">
          <ChevronLeft className="size-4" /> Back
        </Button>
        <span className="text-xs text-muted-foreground">Review your character, then finish above.</span>
      </div>
    );
  }
  return (
    <div className="space-y-2 border-t border-border pt-4">
      {/* VISIBLE gate explanation — a title tooltip is unreachable on a disabled button (CSS
          pointer-events:none) and doesn't exist for touch/SR users at all. aria-live so the hint is
          announced when it appears; the Next button points at it via aria-describedby. */}
      {!locked && !gateSatisfied && gateHint && (
        <p id="wizard-gate-hint" aria-live="polite" className="text-xs font-medium text-warning">
          {gateHint}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack} disabled={isFirst || locked} title={lockTitle} className="min-h-11">
          <ChevronLeft className="size-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {skippable && (
            <Button type="button" variant="ghost" onClick={onSkip} disabled={locked} title={lockTitle} className="min-h-11">
              Skip this step
            </Button>
          )}
          <Button
            type="button"
            onClick={onNext}
            disabled={locked || !gateSatisfied}
            aria-describedby={!locked && !gateSatisfied && gateHint ? "wizard-gate-hint" : undefined}
            className="min-h-11"
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DesktopSpine({ stepIndex, status, error }: { stepIndex: number; status: SaveStatus; error: string | null }) {
  return (
    <nav
      aria-label="Character creation steps"
      className="hidden shrink-0 lg:sticky lg:top-20 lg:block lg:w-56"
    >
      <ol className="space-y-1">
        {STEPS.map((step, i) => {
          const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "upcoming";
          return (
            <li
              key={step.key}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  state === "done" && "border-success bg-success/15 text-success",
                  state === "current" && "border-gold bg-gold text-primary-foreground",
                  state === "upcoming" && "border-border bg-surface-sunken text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  state === "current" && "text-gold",
                  state === "done" && "text-foreground",
                  state === "upcoming" && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 border-t border-border pt-3">
        <SaveStatusBadge status={status} error={error} />
      </div>
    </nav>
  );
}

function MobileSpine({ stepIndex, status, error }: { stepIndex: number; status: SaveStatus; error: string | null }) {
  const current = STEPS[stepIndex]!;
  return (
    <div className="sticky top-14 z-20 mb-4 rounded-xl border border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step {stepIndex + 1} of {STEPS.length}
        </span>
        <span className="truncate text-base font-bold text-gold">{current.label}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {STEPS.map((step, i) => (
          <span
            key={step.key}
            aria-hidden
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < stepIndex ? "bg-success" : i === stepIndex ? "bg-gold" : "bg-border",
            )}
          />
        ))}
      </div>
      <div className="mt-2">
        <SaveStatusBadge status={status} error={error} />
      </div>
    </div>
  );
}
