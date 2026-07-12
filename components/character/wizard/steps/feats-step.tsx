"use client";

import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { isModuleKeyEnabled } from "@pathforge/schema";
import { enabledThreeppSystems } from "@/lib/character/threepp";
import { Button } from "@/components/ui/button";
import { FeatPicker } from "../../editor/feat-picker";
import { EntryPicker, type EntryRow } from "../../editor/entry-picker";
import { DrawbackPicker } from "../../editor/drawback-picker";
import { ThreeppSystemBadge } from "../../editor/picker-shell";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * A compact removable chip for the wizard's "what you've picked" strips — the SphereChip shape
 * (spheres-editor.tsx) reused locally since that component isn't exported and this file must not
 * import character-editor.tsx.
 */
function RemovableChip({
  label,
  sub,
  onRemove,
  removeLabel,
}: {
  label: string;
  sub?: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-sunken py-1 pl-2.5 pr-1 text-xs">
      <span className="min-w-0 truncate text-foreground">
        {label}
        {sub && <span className="text-muted-foreground"> · {sub}</span>}
      </span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <Trash2 className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * §4.3 "feats-step.tsx" — "Feats, Traits & Drawbacks". Wraps the three SEPARATE-FILE compendium
 * pickers the full Feats editor composes (`FeatPicker`, `EntryPicker` for traits, `DrawbackPicker`),
 * none of which live in `character-editor.tsx` — safe to import into the wizard bundle. Above each
 * picker, a compact removable-chip strip mirrors `character-editor.tsx`'s FeatsEditor write shapes
 * exactly (`c.feats.list.splice(i, 1)` / `c.traits.list.splice(i, 1)` by the row's live index) rather
 * than re-deriving them. Drawbacks are just traits with `type: "Flaw" | "Drawback"` (no separate
 * schema), so they already show up in the traits chip strip once added.
 */
export function FeatsStep({
  ed,
  heading = "Feats, traits & drawbacks",
  intro = "Feats and traits round out what your character is good at beyond their class. This step is optional — skip it and add these later from the full editor.",
  showLevelOneGuideline = true,
}: {
  ed: CharacterEditorApi;
  characterId: string;
  /** Level-up wizard Stage 5 reuse (same additive pattern as HpStep/SkillsStep's heading/intro) —
   * the level-up wrapper overrides the create-flow copy and suppresses the level-1 guideline (a
   * review caught the wrapper stacking a second h2 card on top of this one instead). Defaults keep
   * the create wizard byte-identical. */
  heading?: string;
  intro?: string;
  showLevelOneGuideline?: boolean;
}) {
  const [featPickerOpen, setFeatPickerOpen] = useState(false);
  const [traitPickerOpen, setTraitPickerOpen] = useState(false);
  const [drawbackPickerOpen, setDrawbackPickerOpen] = useState(false);

  const feats = ed.draft.feats.list;
  const traits = ed.draft.traits.list;
  const drawbacksEnabled = isModuleKeyEnabled(ed.draft, "flaws_drawbacks");
  const threeppSystems = enabledThreeppSystems(ed.draft);
  const addedTraitIds = new Set(traits.map((t) => t.compendiumId).filter(Boolean) as string[]);

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">{heading}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{intro}</p>
        {showLevelOneGuideline && (
          <p className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-xs text-foreground">
            A typical level 1 character picks <strong>1 feat</strong> (plus a bonus feat if human) and{" "}
            <strong>2 traits</strong> — just a guideline, not a hard limit.
          </p>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Feats</h3>
          <Button
            type="button"
            size="sm"
            variant={featPickerOpen ? "default" : "secondary"}
            onClick={() => setFeatPickerOpen((o) => !o)}
          >
            <Search className="size-4" /> Browse feats
          </Button>
        </div>
        {featPickerOpen && (
          <FeatPicker ed={ed} onClose={() => setFeatPickerOpen(false)} autoFocusSearch={false} />
        )}
        {feats.length === 0 ? (
          <p className="text-xs text-muted-foreground">No feats yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {feats.map((f, i) => (
              <RemovableChip
                key={f.id}
                label={f.name}
                sub={f.type}
                removeLabel={`Remove ${f.name}`}
                onRemove={() => ed.update((c) => c.feats.list.splice(i, 1))}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            Traits{drawbacksEnabled ? " & drawbacks" : ""}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={traitPickerOpen ? "default" : "secondary"}
              onClick={() => setTraitPickerOpen((o) => !o)}
            >
              <Search className="size-4" /> Browse traits
            </Button>
            {drawbacksEnabled && (
              <Button
                type="button"
                size="sm"
                variant={drawbackPickerOpen ? "default" : "secondary"}
                onClick={() => setDrawbackPickerOpen((o) => !o)}
              >
                <Search className="size-4" /> Drawbacks &amp; flaws
              </Button>
            )}
          </div>
        </div>
        {drawbackPickerOpen && (
          <DrawbackPicker ed={ed} onClose={() => setDrawbackPickerOpen(false)} autoFocusSearch={false} />
        )}
        {traitPickerOpen && (
          <EntryPicker
            title="Trait compendium"
            rpc="search_trait_compendium"
            placeholder="Search traits — e.g. Reactionary, Magical Knack…"
            addedIds={addedTraitIds}
            onClose={() => setTraitPickerOpen(false)}
            autoFocusSearch={false}
            renderMeta={(r) =>
              [r.category || r.type, r.requirements ? `req: ${String(r.requirements).replace(/<br>/g, " ")}` : null]
                .filter(Boolean)
                .map(String)
                .join(" · ")
            }
            onAdd={(r) =>
              ed.update((c) => {
                if (c.traits.list.some((t) => t.compendiumId === String(r.slug))) return;
                c.traits.list.push({
                  id: newId("trait"),
                  name: String(r.name),
                  type: r.type ? String(r.type) : r.category ? String(r.category) : undefined,
                  compendiumId: String(r.slug),
                  description: r.description ? String(r.description).replace(/<br>/g, " ") : undefined,
                  automation: [],
                });
              })
            }
            secondary={
              threeppSystems.length > 0
                ? {
                    rpc: "search_threepp_trait_compendium",
                    label: "Third-party",
                    filter: (r: EntryRow) => typeof r.system === "string" && (threeppSystems as string[]).includes(r.system),
                    rowId: (r: EntryRow) => `3pp:${r.slug}`,
                    renderBadges: (r: EntryRow) => <ThreeppSystemBadge system={typeof r.system === "string" ? r.system : null} />,
                    renderMeta: (r: EntryRow) => [r.type, r.source].filter(Boolean).map(String).join(" · "),
                    onAdd: (r: EntryRow) =>
                      ed.update((c) => {
                        const cid = `3pp:${r.slug}`;
                        if (c.traits.list.some((t) => t.compendiumId === cid)) return;
                        c.traits.list.push({
                          id: newId("trait"),
                          name: String(r.name),
                          type: r.type ? String(r.type) : undefined,
                          compendiumId: cid,
                          description: r.description ? String(r.description).replace(/<br>/g, " ") : undefined,
                          automation: [],
                        });
                      }),
                  }
                : undefined
            }
          />
        )}
        {traits.length === 0 ? (
          <p className="text-xs text-muted-foreground">No traits yet (most characters take two).</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {traits.map((t, i) => (
              <RemovableChip
                key={t.id}
                label={t.name}
                sub={t.type}
                removeLabel={`Remove ${t.name}`}
                onRemove={() => ed.update((c) => c.traits.list.splice(i, 1))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
