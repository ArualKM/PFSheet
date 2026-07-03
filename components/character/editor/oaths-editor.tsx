"use client";

import { useId, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Handshake } from "@/components/ui/game-icons";
import { isModuleKeyEnabled, parseOathPoints, type OathsBlock } from "@pathforge/schema";
import { brToNewlines } from "@/lib/character/psionic-powers";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField, TextField, TextAreaField } from "./fields";
import { EntryCard } from "./entry-card";
import { StatChip } from "./picker-shell";
import { EntryPicker, type EntryRow } from "./entry-picker";
import { Button } from "@/components/ui/button";

/**
 * Oaths editor (3PP Phase 6 — docs/3PP_MASTER_PLAN.md): sworn oaths each worth Oath points, spent
 * on oath boons. Lives in the gated "Optional" section group; the budget computes through
 * `summary.oaths` (the engine), never locally. Overspending warns, never blocks — "see text"
 * point values default to 1 with the raw cell noted at pick time.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function OathsEditor({ ed }: { ed: CharacterEditorApi }) {
  const block = ed.draft.oaths;
  const summary = ed.computed.summary.oaths;
  const moduleOn = isModuleKeyEnabled(ed.draft, "oaths");
  const bonusLabelId = useId();
  const [oathPickerOpen, setOathPickerOpen] = useState(false);
  const [boonPickerOpen, setBoonPickerOpen] = useState(false);
  const [openOathId, setOpenOathId] = useState<string | null>(null);
  const [openBoonId, setOpenBoonId] = useState<string | null>(null);

  const ensure = (mut: (b: OathsBlock) => void) =>
    ed.update((c) => {
      if (!c.oaths) c.oaths = { oaths: [], boons: [], bonusPoints: 0 };
      mut(c.oaths);
    });

  // compendiumIds are stored "3pp:<slug>"; EntryPicker's Added check compares raw slugs.
  const addedOathIds = new Set(
    (block?.oaths ?? []).map((o) => o.compendiumId?.replace(/^3pp:/, "")).filter(Boolean) as string[],
  );
  const addedBoonIds = new Set(
    (block?.boons ?? []).map((b) => b.compendiumId?.replace(/^3pp:/, "")).filter(Boolean) as string[],
  );

  const addOathFromRow = (r: EntryRow) => {
    const { points, raw } = parseOathPoints(str(r.oath_points));
    const cid = `3pp:${r.slug}`;
    const id = newId("oath");
    ensure((b) => {
      if (b.oaths.some((o) => o.compendiumId === cid)) return;
      b.oaths.push({
        id,
        name: String(r.name),
        compendiumId: cid,
        points,
        oathText: brToNewlines(str(r.oath)),
        defiancePenalty: brToNewlines(str(r.defiance_penalty)),
        atonement: brToNewlines(str(r.atonement)),
        ...(raw ? { notes: `Oath points: ${raw} — set the value your table rules.` } : {}),
      });
    });
    setOpenOathId(id);
  };

  const addBoonFromRow = (r: EntryRow) => {
    const { points, raw } = parseOathPoints(str(r.oath_point_cost));
    const cid = `3pp:${r.slug}`;
    const id = newId("boon");
    ensure((b) => {
      if (b.boons.some((x) => x.compendiumId === cid)) return;
      b.boons.push({
        id,
        name: String(r.name),
        compendiumId: cid,
        cost: points,
        boonType: str(r.type)?.trim() || undefined,
        description: brToNewlines(str(r.description)),
        ...(raw ? { notes: `Cost: ${raw} — set the value your table rules.` } : {}),
      });
    });
    setOpenBoonId(id);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Swearing an oath earns Oath points; spend them on oath boons. Breaking an oath invokes its
        defiance penalty until you atone.
      </p>

      {/* Live budget — straight from the engine's summary. */}
      {summary ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">Oath points</span>
            <StatChip label="earned" value={summary.pointsEarned} tone="rune" />
            <StatChip label="spent" value={summary.pointsSpent} />
            <StatChip label="available" value={summary.available} tone={summary.available < 0 ? "poor" : "good"} />
          </div>
          <div role="group" aria-labelledby={bonusLabelId} className="flex flex-wrap items-center gap-1.5">
            <span id={bonusLabelId} className="text-xs text-muted-foreground">
              Bonus points
            </span>
            <Button
              size="sm"
              variant="outline"
              aria-label="Decrease bonus Oath points"
              onClick={() => ensure((b) => (b.bonusPoints = b.bonusPoints - 1))}
            >
              −
            </Button>
            <span className="tnum text-base font-semibold text-foreground">{block?.bonusPoints ?? 0}</span>
            <Button
              size="sm"
              variant="outline"
              aria-label="Increase bonus Oath points"
              onClick={() => ensure((b) => (b.bonusPoints = b.bonusPoints + 1))}
            >
              +
            </Button>
            <span className="text-[11px] text-muted-foreground">GM grants / resolved “see text” values</span>
          </div>
        </div>
      ) : !moduleOn ? (
        <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          Enable the Oaths module in Settings to compute the Oath-point budget.
        </p>
      ) : null}

      {(summary?.warnings ?? []).map((w) => (
        <p key={w} className="text-xs text-warning">
          {w}
        </p>
      ))}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Oaths sworn ({block?.oaths.length ?? 0})</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={oathPickerOpen ? "default" : "secondary"} onClick={() => setOathPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = newId("oath");
                ensure((b) => b.oaths.push({ id, name: "New oath", points: 1, custom: true }));
                setOpenOathId(id);
              }}
            >
              <Plus className="size-4" /> Oath
            </Button>
          </div>
        </div>
        {oathPickerOpen && (
          <div className="mb-3">
            <EntryPicker
              title="Oath compendium"
              icon={<Handshake />}
              rpc="search_oath_compendium"
              placeholder="Search oaths — e.g. Oath of Poverty…"
              addedIds={addedOathIds}
              onClose={() => setOathPickerOpen(false)}
              renderMeta={(r) => [str(r.oath_points) ? `${r.oath_points} pt` : null, str(r.source)].filter(Boolean).join(" · ")}
              onAdd={addOathFromRow}
            />
          </div>
        )}
        {(block?.oaths.length ?? 0) === 0 && !oathPickerOpen && (
          <p className="text-sm text-muted-foreground">
            No oaths sworn — Browse the compendium or add one manually.
          </p>
        )}
        <div className="space-y-2">
          {block?.oaths.map((o, i) => {
            const setOath = (mut: (t: OathsBlock["oaths"][number]) => void) =>
              ensure((b) => {
                const t = b.oaths[i];
                if (t) mut(t);
              });
            return (
              <EntryCard
                key={o.id}
                name={o.name}
                nameLabel="Oath"
                onNameChange={(v) => setOath((t) => (t.name = v))}
                onRemove={() => ensure((b) => b.oaths.splice(i, 1))}
                removeLabel={`Remove ${o.name || "oath"}`}
                defaultOpen={o.id === openOathId}
                chips={
                  <>
                    <StatChip label="points" value={`+${o.points}`} tone="rune" />
                    {o.custom && <StatChip value="Custom" />}
                  </>
                }
              >
                <NumberField
                  label="Oath points"
                  value={o.points}
                  min={0}
                  onChange={(v) => setOath((t) => (t.points = Math.max(0, v)))}
                  className="w-24"
                />
                <TextAreaField
                  label="Oath"
                  value={o.oathText ?? ""}
                  onChange={(v) => setOath((t) => (t.oathText = v || undefined))}
                  rows={3}
                />
                <TextAreaField
                  label="Defiance penalty"
                  value={o.defiancePenalty ?? ""}
                  onChange={(v) => setOath((t) => (t.defiancePenalty = v || undefined))}
                  rows={2}
                />
                <TextAreaField
                  label="Atonement"
                  value={o.atonement ?? ""}
                  onChange={(v) => setOath((t) => (t.atonement = v || undefined))}
                  rows={2}
                />
                <TextAreaField
                  label="Notes"
                  value={o.notes ?? ""}
                  onChange={(v) => setOath((t) => (t.notes = v || undefined))}
                  rows={2}
                />
              </EntryCard>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Oath boons ({block?.boons.length ?? 0})</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={boonPickerOpen ? "default" : "secondary"} onClick={() => setBoonPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = newId("boon");
                ensure((b) => b.boons.push({ id, name: "New boon", cost: 1, custom: true }));
                setOpenBoonId(id);
              }}
            >
              <Plus className="size-4" /> Boon
            </Button>
          </div>
        </div>
        {boonPickerOpen && (
          <div className="mb-3">
            <EntryPicker
              title="Oath boon compendium"
              icon={<Handshake />}
              rpc="search_oath_boon_compendium"
              placeholder="Search boons — e.g. Accelerated Recovery…"
              addedIds={addedBoonIds}
              onClose={() => setBoonPickerOpen(false)}
              renderMeta={(r) =>
                [str(r.oath_point_cost) ? `${r.oath_point_cost} pt` : null, str(r.type), str(r.source)]
                  .filter(Boolean)
                  .join(" · ")
              }
              onAdd={addBoonFromRow}
            />
          </div>
        )}
        {(block?.boons.length ?? 0) === 0 && !boonPickerOpen && (
          <p className="text-sm text-muted-foreground">
            No boons yet — spend your earned Oath points on boons from the compendium.
          </p>
        )}
        <div className="space-y-2">
          {block?.boons.map((bn, i) => {
            const setBoon = (mut: (t: OathsBlock["boons"][number]) => void) =>
              ensure((b) => {
                const t = b.boons[i];
                if (t) mut(t);
              });
            return (
              <EntryCard
                key={bn.id}
                name={bn.name}
                nameLabel="Boon"
                onNameChange={(v) => setBoon((t) => (t.name = v))}
                onRemove={() => ensure((b) => b.boons.splice(i, 1))}
                removeLabel={`Remove ${bn.name || "boon"}`}
                defaultOpen={bn.id === openBoonId}
                chips={
                  <>
                    <StatChip label="cost" value={`−${bn.cost}`} />
                    {bn.boonType && <StatChip value={bn.boonType} tone={bn.boonType.toLowerCase() === "su" ? "rune" : "gold"} />}
                    {bn.custom && <StatChip value="Custom" />}
                  </>
                }
              >
                <div className="flex flex-wrap items-end gap-2">
                  <NumberField
                    label="Point cost"
                    value={bn.cost}
                    min={0}
                    onChange={(v) => setBoon((t) => (t.cost = Math.max(0, v)))}
                    className="w-24"
                  />
                  <TextField
                    label="Type (Ex/Su)"
                    value={bn.boonType ?? ""}
                    onChange={(v) => setBoon((t) => (t.boonType = v || undefined))}
                    className="w-28"
                  />
                </div>
                <TextAreaField
                  label="Description"
                  value={bn.description ?? ""}
                  onChange={(v) => setBoon((t) => (t.description = v || undefined))}
                  rows={3}
                />
                <TextAreaField
                  label="Notes"
                  value={bn.notes ?? ""}
                  onChange={(v) => setBoon((t) => (t.notes = v || undefined))}
                  rows={2}
                />
              </EntryCard>
            );
          })}
        </div>
      </section>

      <TextAreaField
        label="Oath notes"
        value={block?.notes ?? ""}
        onChange={(v) => ensure((b) => (b.notes = v || undefined))}
        rows={2}
      />
    </div>
  );
}
