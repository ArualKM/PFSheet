"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RacePicker } from "../../editor/race-picker";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/** §4.3 quick-pick races — client-side constants, not a new compendium query. */
const QUICK_PICK_RACES = ["Human", "Elf", "Dwarf", "Halfling"];

/**
 * §4.3 "race-step.tsx" — wraps `RacePicker` unwrapped (it already renders as an inline card, not a
 * modal, so it's exactly the wizard step shape). The quick-pick chips prefill the picker's search:
 * `RacePicker` only accepts `initialQuery` as a `useState` initializer (not a live-reactive prop),
 * so a chip click re-keys the picker to force a clean remount with the new initial query — the
 * picker's own documented API surface (`initialQuery`), no internal state poked from outside.
 *
 * Adversarial-review fix (finding A): that remount used to carry the picker's own hardcoded
 * autofocus, popping the mobile keyboard unprompted on every chip tap (and on step entry). Passes
 * `autoFocusSearch={false}` — an additive opt-out `RacePicker` now exposes — to suppress it here
 * while every other call site (the full editor's Races section) is unaffected.
 */
export function RaceStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Choose a race</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Your race affects your ability scores, size, and speed. You can skip this and pick one
          later if you&rsquo;re not sure yet.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Popular:</span>
        <div role="group" aria-label="Popular races" className="flex flex-wrap items-center gap-1.5">
          {QUICK_PICK_RACES.map((name) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={query === name ? "default" : "secondary"}
              aria-pressed={query === name}
              className="min-h-9"
              onClick={() => setQuery(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      </div>

      {/* Keyed on `query` so a chip click remounts the picker fresh with the new initialQuery —
          there's nothing to "close" in the wizard (one panel per step), so onClose is a no-op.
          autoFocusSearch=false (finding A): a chip-driven remount must not pop the keyboard. */}
      <RacePicker key={query} ed={ed} onClose={() => {}} initialQuery={query} autoFocusSearch={false} />
    </div>
  );
}

/** Per §4.3: the step is skippable, so this gate only disables Next — Skip always stays available.
 * A race is "chosen" once its ability mods/size/speed have actually been applied (matches the
 * editor's own `raceNeedsApply` check elsewhere) — not just a typed name. */
export function canAdvanceRace(ed: CharacterEditorApi): boolean {
  return Boolean(ed.draft.identity.raceApplied);
}
