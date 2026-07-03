"use client";

import { useMemo, useState } from "react";
import { Plus, Check, Search } from "lucide-react";
import { ScrollText } from "@/components/ui/game-icons";
import { isModuleKeyEnabled, parseOccupationFeats, type BackgroundOccupationBlock } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
import { brToNewlines } from "@/lib/character/psionic-powers";
import type { CharacterEditorApi } from "./use-character-editor";
import { TextAreaField } from "./fields";
import { EntryCard } from "./entry-card";
import { StatChip } from "./picker-shell";
import { EntryPicker, type EntryRow } from "./entry-picker";
import { Button } from "@/components/ui/button";

/**
 * Backgrounds & Occupations editor (3PP Phase 6, module `backgrounds_occupations`): one narrative
 * background + one occupation, each picked from its compendium (detail cached on the sheet) or
 * typed by hand. An occupation's bonus-feat choice gets one-click "Add" buttons (exact-name
 * feat_compendium link when unambiguous); class skills are NEVER auto-applied — the occupation
 * text is a "choose N of the following" table call, surfaced with a hint instead.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function BackgroundOccupationEditor({ ed }: { ed: CharacterEditorApi }) {
  const supabase = useMemo(() => createClient(), []);
  const bo = ed.draft.backgroundOccupation;
  const moduleOn = isModuleKeyEnabled(ed.draft, "backgrounds_occupations");
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [occPickerOpen, setOccPickerOpen] = useState(false);
  // slugs whose feat link lookup is in flight (one add at a time is fine; guards double-clicks).
  const [addingFeat, setAddingFeat] = useState<string | null>(null);

  const ensure = (mut: (b: BackgroundOccupationBlock) => void) =>
    ed.update((c) => {
      if (!c.backgroundOccupation) c.backgroundOccupation = {};
      mut(c.backgroundOccupation);
    });

  const featChoices = parseOccupationFeats(bo?.occupation?.grantedFeat);
  const hasFeat = (name: string) =>
    ed.draft.feats.list.some((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addGrantedFeat = async (featName: string) => {
    if (addingFeat || hasFeat(featName)) return;
    setAddingFeat(featName);
    const occupationName = bo?.occupation?.name || "occupation";
    let compendiumId: string | undefined;
    try {
      // Exact-name link (case-insensitive; % and _ escaped so ilike stays an equality probe).
      // Single match only — an ambiguous or missing name adds the feat unlinked.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("feat_compendium")
        .select("slug,name")
        .ilike("name", featName.replace(/([%_\\])/g, "\\$1"))
        .limit(2);
      if (Array.isArray(data) && data.length === 1 && data[0]?.slug) compendiumId = String(data[0].slug);
    } catch {
      // fail soft — the feat is still added, just unlinked
    }
    ed.update((c) => {
      if (c.feats.list.some((f) => f.name.trim().toLowerCase() === featName.trim().toLowerCase())) return;
      c.feats.list.push({
        id: newId("feat"),
        name: featName,
        ...(compendiumId ? { compendiumId } : {}),
        notes: `From occupation: ${occupationName}`,
        tags: [],
        automation: [],
      });
    });
    setAddingFeat(null);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        A background describes where you come from; an occupation is what you did before
        adventuring — it opens class-skill picks and sometimes a bonus feat.
      </p>
      {!moduleOn && (bo?.background || bo?.occupation) && (
        <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          The Backgrounds &amp; Occupations module is off — this data stays on the sheet but no
          panel card shows on the read view until you re-enable it in Settings.
        </p>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Background</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={bgPickerOpen ? "default" : "secondary"} onClick={() => setBgPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            {!bo?.background && (
              <Button size="sm" variant="ghost" onClick={() => ensure((b) => (b.background = { name: "" }))}>
                <Plus className="size-4" /> Manual
              </Button>
            )}
          </div>
        </div>
        {bgPickerOpen && (
          <div className="mb-3">
            <EntryPicker
              title="Background compendium"
              icon={<ScrollText />}
              rpc="search_background_compendium"
              placeholder="Search backgrounds — e.g. Rural, Outlaw…"
              addedIds={
                new Set(bo?.background?.compendiumId ? [bo.background.compendiumId.replace(/^3pp:/, "")] : [])
              }
              onClose={() => setBgPickerOpen(false)}
              renderMeta={(r) => str(r.type) ?? ""}
              onAdd={(r: EntryRow) => {
                ensure((b) => {
                  b.background = {
                    name: String(r.name),
                    compendiumId: `3pp:${r.slug}`,
                    description: brToNewlines(str(r.description)),
                  };
                });
                setBgPickerOpen(false);
              }}
            />
          </div>
        )}
        {bo?.background ? (
          <EntryCard
            name={bo.background.name}
            nameLabel="Background"
            onNameChange={(v) => ensure((b) => b.background && (b.background.name = v))}
            onRemove={() => ensure((b) => (b.background = undefined))}
            removeLabel={`Remove ${bo.background.name || "background"}`}
            chips={bo.background.compendiumId ? <StatChip value="Compendium" tone="rune" /> : undefined}
          >
            <TextAreaField
              label="Description"
              value={bo.background.description ?? ""}
              onChange={(v) => ensure((b) => b.background && (b.background.description = v || undefined))}
              rows={4}
            />
          </EntryCard>
        ) : (
          !bgPickerOpen && <p className="text-sm text-muted-foreground">No background set.</p>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Occupation</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={occPickerOpen ? "default" : "secondary"} onClick={() => setOccPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            {!bo?.occupation && (
              <Button size="sm" variant="ghost" onClick={() => ensure((b) => (b.occupation = { name: "" }))}>
                <Plus className="size-4" /> Manual
              </Button>
            )}
          </div>
        </div>
        {occPickerOpen && (
          <div className="mb-3">
            <EntryPicker
              title="Occupation compendium"
              icon={<ScrollText />}
              rpc="search_occupation_compendium"
              placeholder="Search occupations — e.g. Acolyte, Bandit…"
              addedIds={
                new Set(bo?.occupation?.compendiumId ? [bo.occupation.compendiumId.replace(/^3pp:/, "")] : [])
              }
              onClose={() => setOccPickerOpen(false)}
              renderMeta={(r) => {
                const feats = parseOccupationFeats(str(r.granted_feat));
                return feats.length > 0 ? `Bonus feat: ${feats.join(" / ")}` : (str(r.class_skills_or_benefit) ?? "").replace(/<br\s*\/?>/gi, " ");
              }}
              onAdd={(r: EntryRow) => {
                ensure((b) => {
                  b.occupation = {
                    name: String(r.name),
                    compendiumId: `3pp:${r.slug}`,
                    benefit: brToNewlines(str(r.class_skills_or_benefit)),
                    grantedFeat: brToNewlines(str(r.granted_feat)),
                    description: brToNewlines(str(r.description)),
                  };
                });
                setOccPickerOpen(false);
              }}
            />
          </div>
        )}
        {bo?.occupation ? (
          <EntryCard
            name={bo.occupation.name}
            nameLabel="Occupation"
            onNameChange={(v) => ensure((b) => b.occupation && (b.occupation.name = v))}
            onRemove={() => ensure((b) => (b.occupation = undefined))}
            removeLabel={`Remove ${bo.occupation.name || "occupation"}`}
            chips={
              <>
                {bo.occupation.compendiumId && <StatChip value="Compendium" tone="rune" />}
                {featChoices.length > 0 && <StatChip label="bonus feat" value={featChoices.length > 1 ? "choice" : featChoices[0]} tone="gold" />}
              </>
            }
          >
            {(bo.occupation.benefit || bo.occupation.grantedFeat) && (
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">Benefit</span>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {[bo.occupation.benefit, bo.occupation.grantedFeat].filter(Boolean).join("\n")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Class skills aren&rsquo;t applied automatically — mark your chosen skills as class
                  skills in the Skills section.
                </p>
              </div>
            )}
            {featChoices.length > 0 && (
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">
                  Bonus feat {featChoices.length > 1 ? "(choose one)" : ""}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {featChoices.map((name) => {
                    const already = hasFeat(name);
                    return (
                      <Button
                        key={name}
                        size="sm"
                        variant={already ? "ghost" : "secondary"}
                        disabled={already || addingFeat !== null}
                        onClick={() => addGrantedFeat(name)}
                      >
                        {already ? (
                          <>
                            <Check className="size-4" /> {name}
                          </>
                        ) : (
                          <>
                            <Plus className="size-4" /> Add {name}
                          </>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            <TextAreaField
              label="Description"
              value={bo.occupation.description ?? ""}
              onChange={(v) => ensure((b) => b.occupation && (b.occupation.description = v || undefined))}
              rows={4}
            />
          </EntryCard>
        ) : (
          !occPickerOpen && <p className="text-sm text-muted-foreground">No occupation set.</p>
        )}
      </section>

      <TextAreaField
        label="Notes"
        value={bo?.notes ?? ""}
        onChange={(v) => ensure((b) => (b.notes = v || undefined))}
        rows={2}
      />
    </div>
  );
}
