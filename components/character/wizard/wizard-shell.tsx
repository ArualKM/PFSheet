"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { useShouldAnimate } from "@/components/motion/use-should-animate";
import { pfDurFast, pfEase } from "@/components/motion/tokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CharacterEditorApi, SaveStatus } from "../editor/use-character-editor";
// From its own tiny module — importing it from character-editor.tsx pulls the whole ~5,400-line
// editor graph (~1.2MB) into the wizard bundle (a confirmed review finding).
import { SaveStatusBadge } from "../editor/save-status-badge";
import { ConflictResolver } from "../editor/conflict-resolver";

/**
 * S6 Pillar 3 §4.2 step shell — generalized in the level-up wizard's Stage 2
 * (`docs/LEVELUP_WIZARD/MASTER_PLAN.md` "Shell generalization design") so ONE shell drives both the
 * create wizard AND the level-up wizard, rather than forking the chrome (the codebase's standing
 * discipline: don't fork a mechanism already built once — see the Items epic's linked-attack sync,
 * the DRY'd buff/automation effect-row). The create wizard's own step table (labels/help/render/
 * gates/hints, content unchanged) now lives in `create-wizard-steps.ts` as `CREATE_WIZARD_STEPS`;
 * this file owns only the chrome: `DesktopSpine`/`MobileSpine`, the `ConflictResolver` wiring, the
 * entrance-animation `prevKey` idiom, and `WizardFooter`'s a11y-correct gate-hint plumbing.
 */

export type WizardStepProps = { ed: CharacterEditorApi; characterId: string };

export type WizardStepDef = {
  key: string;
  label: string;
  help: string;
  /** Whether "Skip this step" is offered — not the welcome/done bookends. */
  skippable: boolean;
  /** Optional Next gate — disables Next (never Skip) until the step's pick is coherent, using the
   *  same engine predicates the editors use (doc §7: never invent new ones). */
  canAdvance?: (ed: CharacterEditorApi) => boolean;
  /** ACTIONABLE copy for a failed gate — rendered as VISIBLE text next to the disabled Next button
   *  (a `title` tooltip never reaches anyone: `disabled:pointer-events-none` suppresses hover, and
   *  touch/screen-reader users have no hover at all). Only meaningful alongside `canAdvance`. */
  gateHint?: string;
  /** Absent = always visible (every existing create-wizard step). When present and false, the step
   *  is omitted from the spine, from Next/Back sequencing, and from resume — but its render function
   *  and any data it wrote are untouched; re-satisfying the predicate (e.g. the player adds a caster
   *  on the Class step) makes it reappear with whatever was already on the draft. Re-evaluated fresh
   *  on EVERY render, never frozen at session start — see `resolveVisibleStep`. */
  visible?: (ed: CharacterEditorApi) => boolean;
  render: (props: WizardStepProps) => ReactNode;
};

/**
 * Resolve which step KEY a session should land on: if `stepKey` is currently visible, stay there.
 * Otherwise walk forward from its position in the FULL `steps` order (the order never changes, only
 * presence) to the first visible step; if none remain forward, fall back to the last visible step
 * overall. Mirrors `resumeStepFor`'s "a stored key may no longer be reachable in the current
 * sequence; walk forward to the nearest one that is" idiom, extended with a live per-render
 * visibility check instead of a static order-version comparison.
 *
 * Used both for `initialStep` hardening (a checkpoint may point at a step that's hidden this
 * session) and, every render, to re-land a user whose CURRENT step's predicate just flipped false.
 */
function resolveVisibleStep(steps: WizardStepDef[], stepKey: string, ed: CharacterEditorApi): string {
  const isVisible = (s: WizardStepDef) => !s.visible || s.visible(ed);
  const startIndex = Math.max(0, steps.findIndex((s) => s.key === stepKey));
  for (let i = startIndex; i < steps.length; i++) {
    if (isVisible(steps[i]!)) return steps[i]!.key;
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    if (isVisible(steps[i]!)) return steps[i]!.key;
  }
  // No visible steps at all — shouldn't happen for any real step list; fall back to whatever was
  // asked rather than throwing, so a degenerate caller doesn't crash the shell.
  return stepKey;
}

export function WizardShell({
  ed,
  characterId,
  steps,
  initialStep,
  writeStep,
  navLabel = "Character creation steps",
}: {
  ed: CharacterEditorApi;
  characterId: string;
  /** The FULL ordered step list for this wizard — filtering to what's relevant THIS session happens
   *  fresh inside, every render. Order never changes, only presence. */
  steps: WizardStepDef[];
  initialStep: string;
  /** Persists the current step key into whichever `metadata.custom.<x>` progress bag this wizard
   *  uses (via `ed.update`, so it rides the existing save loop/undo/3-way-merge for free). The
   *  create wizard passes `(c, step) => writeWizardMeta(c, { step: step as WizardStepKey })`; a
   *  level-up wizard passes its own `writeLevelUpMeta` the same way. Replaces the old call that was
   *  hardcoded to `writeWizardMeta` inside `goTo`. */
  writeStep: (c: PathForgeCharacterV1, stepKey: string) => void;
  /** The desktop spine's <nav> landmark name — a review caught the create wizard's label leaking
   *  onto every consumer of the generalized shell; the level-up wizard passes "Level-up steps". */
  navLabel?: string;
}) {
  const shouldAnimate = useShouldAnimate();

  // Visibility is a pure predicate over `ed`, recomputed fresh EVERY render — not frozen at session
  // start (a predicate can flip true or false as the player edits other steps). ALL navigation state
  // below — stepIndex, goTo clamping, Back/Next targets, the spine, "Step N of M" — derives from
  // `visibleSteps`, never from `steps` directly.
  const visibleSteps = steps.filter((s) => !s.visible || s.visible(ed));

  // Track the CURRENT STEP BY KEY, not index — an index alone would silently point at the wrong step
  // the instant a predicate ahead of it flips. The lazy initializer resolves a stale or hidden
  // `initialStep` (e.g. a checkpoint written when a step was visible, resumed after it no longer is)
  // before the first paint.
  const [currentKey, setCurrentKey] = useState(() => resolveVisibleStep(steps, initialStep, ed));

  // If the step the user is ON just disappeared (its predicate flipped false this render), land on
  // the nearest still-visible step — adjust-during-render (the EntryCard / editor-canvas.tsx idiom:
  // compare against tracked prior state, setState conditionally), never a useEffect-driven
  // navigation (the shell must not navigate via an effect).
  if (!visibleSteps.some((s) => s.key === currentKey)) {
    const landed = resolveVisibleStep(steps, currentKey, ed);
    if (landed !== currentKey) setCurrentKey(landed);
  }

  const stepIndex = Math.max(0, visibleSteps.findIndex((s) => s.key === currentKey));
  const current = visibleSteps[stepIndex] ?? steps[0]!;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === visibleSteps.length - 1;

  // Every advance/back/skip mirrors the step into the caller's metadata bag (via ed.update, so it
  // rides the existing save loop/undo/3-way-merge for free) — a refresh mid-wizard resumes here.
  const goTo = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(visibleSteps.length - 1, nextIndex));
    const key = visibleSteps[clamped]!.key;
    setCurrentKey(key);
    ed.update((c) => {
      writeStep(c, key);
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
      <MobileSpine steps={visibleSteps} stepIndex={stepIndex} status={ed.status} error={ed.error} />

      <div className="flex flex-col gap-6 py-4 lg:flex-row lg:items-start lg:gap-8 lg:py-6">
        <DesktopSpine steps={visibleSteps} stepIndex={stepIndex} status={ed.status} error={ed.error} navLabel={navLabel} />

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
            gateHint={current.gateHint}
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

function DesktopSpine({
  steps,
  stepIndex,
  status,
  error,
  navLabel,
}: {
  steps: WizardStepDef[];
  stepIndex: number;
  status: SaveStatus;
  error: string | null;
  navLabel: string;
}) {
  return (
    <nav
      aria-label={navLabel}
      className="hidden shrink-0 lg:sticky lg:top-20 lg:block lg:w-56"
    >
      <ol className="space-y-1">
        {steps.map((step, i) => {
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

function MobileSpine({
  steps,
  stepIndex,
  status,
  error,
}: {
  steps: WizardStepDef[];
  stepIndex: number;
  status: SaveStatus;
  error: string | null;
}) {
  const current = steps[stepIndex]!;
  return (
    <div className="sticky top-14 z-20 mb-4 rounded-xl border border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step {stepIndex + 1} of {steps.length}
        </span>
        <span className="truncate text-base font-bold text-gold">{current.label}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {steps.map((step, i) => (
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
