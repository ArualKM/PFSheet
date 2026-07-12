"use client";

import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { readLevelUpMeta } from "@pathforge/schema";
import { SpellPicker } from "../../editor/spell-picker";
import { StatChip } from "../../editor/picker-shell";
import { Button } from "@/components/ui/button";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * Level-Up Wizard Stage 6 — the Spells step (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list" —
 * no direct wizard-step precedent, the create wizard has no Spells step at all). Wraps the existing
 * compendium `SpellPicker` ({ ed, onClose }, the same convention every other picker in this codebase
 * follows) rather than inventing new spellcasting UI; new spell SLOTS already appear automatically as
 * caster level rises (`recomputeClassDerived`'s per-caster sync, already run by the Class step) — this
 * step is only about the player PICK: new spells known / spellbook entries.
 *
 * `ed.computed.spellcasting` (NOT `summary.spells`, the compact dashboard roll-up that's absent for
 * non-casters) is the real per-caster shape read here: `{ casterId, className, casterType,
 * castingAbility, casterLevel, concentration, slots }` — it carries no "spells known" field. Spells
 * known live on the DRAFT (`spellcasting.knownSpells[]`), and only `preparedSpells` entries are
 * reliably tagged with `casterId` in practice — `SpellPicker.addSpell` never stamps `casterId` onto a
 * `knownSpells` push, so most sheets have zero per-caster attribution today even though the field
 * exists on the schema. Rather than fabricate a per-caster "known" number, each caster chip counts
 * what's ACTUALLY attributed to it via that real field, and the sheet-wide known-spell total is shown
 * alongside so a `0` chip reads as "not attributed yet," never "nothing known."
 */
export function LevelUpSpellsStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const casters = ed.computed.spellcasting;
  const knownSpells = ed.draft.spellcasting.knownSpells;
  const meta = readLevelUpMeta(ed.draft);
  const startingClassIds = meta?.startingClasses?.map((s) => s.id);

  // A class added THIS session (absent from the meta.startingClasses snapshot) that resolves to one
  // of the computed casters below. Correlated in two SEQUENTIAL passes — presetKey exactly, THEN name
  // only when no presetKey match exists anywhere (class-catalog.ts's findPresetCaster idiom): a
  // single find() with an OR'd name clause can return the wrong class when a newly-added caster
  // shares a display name with a pre-existing class (review finding). `startingClasses` may be
  // absent for an in-flight session started before Stage 7 stamped it — degrade by omitting the
  // highlight rather than guessing.
  const isNewCasterThisSession = (casterId: string): boolean => {
    if (!startingClassIds) return false;
    const draftCaster = ed.draft.spellcasting.casters.find((c) => c.id === casterId);
    if (!draftCaster) return false;
    const classes = ed.draft.identity.classes;
    const matchingClass =
      (draftCaster.presetKey ? classes.find((cl) => cl.presetKey === draftCaster.presetKey) : undefined) ??
      classes.find((cl) => (cl.compendiumPreset?.name ?? cl.name).toLowerCase() === draftCaster.className.toLowerCase());
    if (!matchingClass) return false;
    return !startingClassIds.includes(matchingClass.id);
  };

  if (casters.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Spells</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          This character has no casting classes, so there&rsquo;s nothing to pick here — skip ahead.
          (Multiclass into a caster later this session and this step reappears automatically.)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Spells</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          New spell slots already appeared automatically as your caster level rose — what&rsquo;s left
          is choosing new spells known (or new spellbook entries). Fine-tune prepared spells,
          metamagic, and per-caster detail anytime in the full editor&rsquo;s Spells section.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {casters.map((c) => (
          <div
            key={c.casterId}
            className="flex flex-wrap items-center gap-1.5 rounded-lg border border-rune/40 bg-rune/5 px-2.5 py-1.5"
          >
            <span className="text-sm font-medium text-foreground">{c.className}</span>
            <StatChip label="CL" value={c.casterLevel} tone="rune" />
            <StatChip label="known" value={knownSpells.filter((s) => s.casterId === c.casterId).length} />
            {isNewCasterThisSession(c.casterId) && (
              <span className="rounded-full border border-gold/50 bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                New caster this level-up
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {knownSpells.length} spell{knownSpells.length === 1 ? "" : "s"} in your book overall — spells
        added below aren&rsquo;t tied to a specific caster yet, same as the full editor.
      </p>

      <div className="space-y-2">
        <Button
          type="button"
          size="sm"
          variant={pickerOpen ? "default" : "secondary"}
          onClick={() => setPickerOpen((o) => !o)}
        >
          <Search className="size-4" /> Browse spells
        </Button>
        {pickerOpen && <SpellPicker ed={ed} onClose={() => setPickerOpen(false)} />}
      </div>

      {knownSpells.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {knownSpells.map((sp) => (
            <span
              key={sp.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-sunken py-1 pl-2.5 pr-1 text-xs"
            >
              <span className="min-w-0 truncate text-foreground">
                {sp.name}
                <span className="text-muted-foreground"> · L{sp.level}</span>
              </span>
              {/* Removal is id-keyed (not index-keyed) so a stale render can never delete the wrong
                  spell; the tap target overhangs the compact chip (44px mobile / 36px desktop). */}
              <button
                type="button"
                aria-label={`Remove ${sp.name}`}
                onClick={() => ed.update((c) => (c.spellcasting.knownSpells = c.spellcasting.knownSpells.filter((s) => s.id !== sp.id)))}
                className="-my-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:-my-2 sm:size-9"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
