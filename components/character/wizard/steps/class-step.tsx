"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import {
  resolveClassPreset,
  isGestalt,
  gestaltLevel,
  gestaltTracksCollapsed,
  gestaltTrackClassCounts,
  splitGestaltTracks,
  recomputeClassDerived,
  computeMaxHpFromLevels,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { ClassCompendiumPicker } from "../../editor/class-compendium-picker";
import { ArchetypePicker } from "../../editor/archetype-picker";
import { CollapsibleGroup } from "../../collapsible-group";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

type ClassEntry = PathForgeCharacterV1["identity"]["classes"][number];

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
  const classes = ed.draft.identity.classes;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
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

      {/* Applied classes as chips — with resetAfterApply the picker returns to search after each
          apply (owner-reported gestalt bug: it parked in the report state, so "add your second
          class below" pointed at nothing), so THIS row is the applied-state feedback. */}
      {classes.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Your {classes.length === 1 ? "class" : "classes"}:
          {classes.map((cl) => (
            <span
              key={cl.id}
              className="inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground"
            >
              {cl.compendiumPreset?.name ?? cl.name} {cl.level}
            </span>
          ))}
        </p>
      )}

      {/* autoFocusSearch off: entering a wizard step must not pop the mobile keyboard unprompted. */}
      <ClassCompendiumPicker ed={ed} onClose={() => {}} baseOnly autoFocusSearch={false} resetAfterApply />

      <GestaltHint ed={ed} />

      {classes.length > 0 && (
        <CollapsibleGroup title="Optional: apply an archetype" defaultOpen={false}>
          <div className="space-y-2">
            {classes.map((cl) => (
              <ClassArchetypeRow key={cl.id} ed={ed} cl={cl} />
            ))}
          </div>
        </CollapsibleGroup>
      )}
    </div>
  );
}

/**
 * (b) The gestalt hint (§4.3): with the module on and exactly one class applied, remind the player a
 * gestalt build needs a second class for track B. Verified against `gestaltTracksCollapsed` (gestalt.ts
 * / class-catalog.ts) that adding that second class via `ClassCompendiumPicker` does NOT itself land it
 * on track B — `applyCompendiumClass` never sets `.track` (only the full editor's "Custom class" button
 * pre-assigns the empty track; the compendium-apply path relies on the collapse being caught after the
 * fact) — so once a second class lands on the SAME track this renders a "tracks aren't split" banner
 * with a one-click fix instead of silently letting a collapsed (summed) sheet through. Reuses the
 * package's own `splitGestaltTracks`/`recomputeClassDerived`/`computeMaxHpFromLevels` — never
 * reimplements the split or HP-heal math (mirrors `GestaltCollapseBanner` in character-editor.tsx,
 * which isn't exported and can't be imported here).
 *
 * Exported (Level-Up Wizard Stage 3, `docs/LEVELUP_WIZARD/MASTER_PLAN.md`) so the level-up wizard's
 * own Class step reuses this component VERBATIM instead of forking it — the same "don't fork a
 * mechanism already built once" discipline as the rest of this codebase. Its logic doesn't care
 * whether the session is create-a-character or leveling up, so no level-up-specific branch was added.
 */
export function GestaltHint({ ed }: { ed: CharacterEditorApi }) {
  if (!isGestalt(ed.draft)) return null;
  const classes = ed.draft.identity.classes;
  if (classes.length === 0) return null;

  if (gestaltTracksCollapsed(ed.draft)) {
    const { a, b } = gestaltTrackClassCounts(ed.draft);
    const where = a === 0 ? "all on track B" : b === 0 ? "all on track A" : "stacked on one track";
    const split = () =>
      ed.update((c) => {
        const before = c.health.maxHp;
        const autoMethod: "average" | "max" | null =
          before === computeMaxHpFromLevels(c, "average", c.identity.classes).total
            ? "average"
            : before === computeMaxHpFromLevels(c, "max", c.identity.classes).total
              ? "max"
              : null;
        splitGestaltTracks(c);
        c.identity.totalLevel = gestaltLevel(c);
        recomputeClassDerived(c, { hpMethod: autoMethod ?? "manual" });
      });
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/50 bg-warning/10 p-2.5">
        <p className="min-w-0 flex-1 text-xs text-foreground">
          <strong>Gestalt tracks aren&apos;t split.</strong> Your classes are {where}, so BAB, saves,
          level, and HP are being <em>summed</em> instead of taking the best of tracks A / B.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={split}>
          Split into A / B
        </Button>
      </div>
    );
  }

  if (classes.length === 1) {
    return (
      <p className="rounded-lg border border-rune/40 bg-rune/5 p-2.5 text-xs text-foreground">
        <strong>Gestalt is on</strong> — you advance in two class tracks at once and take the best of
        each. This class is on track A — add your <strong>second class (track B)</strong> below.
      </p>
    );
  }
  return null;
}

/** One class row's archetype affordance — Browse toggles `ArchetypePicker` locked to this class
 * (mirrors `ClassRow`'s per-class Archetype button scoping in character-editor.tsx) + a read-only
 * chip strip of what's already applied. Removal stays a full-editor action: un-applying restores the
 * standard features it replaced via an async compendium fetch that's a local closure inside
 * `ClassRow`, not exported — out of scope for this compact wizard panel. */
function ClassArchetypeRow({ ed, cl }: { ed: CharacterEditorApi; cl: ClassEntry }) {
  const [open, setOpen] = useState(false);
  const archetypes = cl.archetypes ?? [];
  const className = cl.compendiumPreset?.name ?? cl.name;
  return (
    <div className="rounded-lg border border-border/60 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{className}</span>
        <Button type="button" size="sm" variant={open ? "default" : "secondary"} onClick={() => setOpen((o) => !o)}>
          <Shield className="size-4" /> {open ? "Close" : "Archetypes"}
        </Button>
      </div>
      {archetypes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {archetypes.map((a) => (
            <span
              key={a.compendiumId ?? a.name}
              className="inline-flex items-center rounded-md border border-rune/50 bg-rune/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground"
            >
              {a.name}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2">
          <ArchetypePicker ed={ed} lockedClassId={cl.id} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Per §4.3: gate on a *resolvable* preset (the same predicate the engine's recompute uses), not
 * merely "a class row exists" — a hand-added Custom class with no preset never satisfies this, which
 * is correct: there'd be no BAB/skill-point context yet to build Skills against. */
export function canAdvanceClass(ed: CharacterEditorApi): boolean {
  return ed.draft.identity.classes.some((cl) => Boolean(resolveClassPreset(cl)));
}
