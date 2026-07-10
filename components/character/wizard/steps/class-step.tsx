"use client";

import { resolveClassPreset } from "@pathforge/schema";
import { ClassCompendiumPicker } from "../../editor/class-compendium-picker";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/** §4.3 quick-pick classes — client-side constants, not a new compendium query. */
const QUICK_PICK_CLASSES = ["Fighter", "Cleric", "Rogue", "Wizard", "Ranger", "Barbarian"];

/**
 * §4.3 "class-step.tsx" — wraps `ClassCompendiumPicker` in Base-only mode (a `baseOnly` prop was
 * added to that picker for this: hides the Base/Prestige Segmented and pins Base — a prestige class
 * needs prerequisites a brand-new character doesn't have yet).
 *
 * DEVIATION from §4.3's quick-pick-chips instruction: unlike `RacePicker`, `ClassCompendiumPicker`
 * has no `initialQuery` (or any other) prop to seed its internal search state, and this pass is
 * scoped to exactly ONE additive prop on that picker (`baseOnly`, for the Base-only gate above) —
 * adding a second prop for search-prefill was out of scope. The chips below are informative only
 * ("Popular: …"); they don't jump the picker to a class preview. A follow-up could add an
 * `initialQuery` prop to `ClassCompendiumPicker` mirroring `RacePicker`'s if this is wanted live.
 */
export function ClassStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rune">Step 3</p>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Choose a class</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Your class is your role in the party — it sets your hit points, attack bonus, and
          whether (and how) you cast spells.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Popular:</span> {QUICK_PICK_CLASSES.join(", ")}
        {" — search for any of these below."}
      </p>

      <ClassCompendiumPicker ed={ed} onClose={() => {}} baseOnly />
    </div>
  );
}

/** Per §4.3: gate on a *resolvable* preset (the same predicate the engine's recompute uses), not
 * merely "a class row exists" — a hand-added Custom class with no preset never satisfies this, which
 * is correct: there'd be no BAB/skill-point context yet to build Skills against. */
export function canAdvanceClass(ed: CharacterEditorApi): boolean {
  return ed.draft.identity.classes.some((cl) => Boolean(resolveClassPreset(cl)));
}
