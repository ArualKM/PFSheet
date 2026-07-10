"use client";

import { useState } from "react";
import { Search, Plus, Trash2 } from "lucide-react";
import { PSIONIC_DISCIPLINES, bonusPowerPoints, parsePsionicPowers, type PsionicsBlock } from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField, TextField, TextAreaField, SelectField } from "./fields";
import { EntryCard } from "./entry-card";
import { StatChip } from "./picker-shell";
import { Button } from "@/components/ui/button";
import { PowerPicker } from "./power-picker";
import { groupPowersByLevel } from "@/lib/character/psionic-powers";
import { CollapsibleGroup, COLLAPSE_WHEN_OVER } from "../collapsible-group";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function PsionicsEditor({ ed }: { ed: CharacterEditorApi }) {
  const ps = ed.draft.psionics;
  const summary = ed.computed.summary.psionics;
  const max = summary?.powerPoints.max ?? 0;
  const current = Math.min(ps?.powerPointsCurrent ?? max, max);
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [powerPickerOpen, setPowerPickerOpen] = useState(false);
  // The id of a just-added power, so its EntryCard mounts already-open for editing (custom add = full editor).
  const [openPowerId, setOpenPowerId] = useState<string | null>(null);

  const ensure = (mut: (p: PsionicsBlock) => void) =>
    ed.update((c) => {
      if (!c.psionics) c.psionics = { classes: [], powersKnown: [] };
      mut(c.psionics);
    });
  const importPowers = () => {
    const { powers, warnings } = parsePsionicPowers(pasteText);
    if (powers.length === 0) {
      setPasteMsg(warnings[0] ?? "Nothing parsed.");
      return;
    }
    ensure((p) => {
      for (const pw of powers) p.powersKnown.push({ ...pw, id: newId("pow") });
    });
    setPasteText("");
    setPasteMsg(`Added ${powers.length} power${powers.length === 1 ? "" : "s"}.${warnings.length ? ` (${warnings.length} note${warnings.length === 1 ? "" : "s"})` : ""}`);
  };
  const spendPP = (delta: number) => ensure((p) => (p.powerPointsCurrent = Math.max(0, Math.min(max, current + delta))));

  // Group powers-known by level for the collapsible sections, keeping a map back to each row's
  // ORIGINAL index so the index-based mutations (setPower / splice) stay correct.
  const powersKnown = ps?.powersKnown ?? [];
  const powerGroups = groupPowersByLevel(powersKnown);
  const powerIndexById = new Map(powersKnown.map((pw, i) => [pw.id, i]));
  const powersOpenByDefault = powersKnown.length <= COLLAPSE_WHEN_OVER;

  const renderPower = (pw: NonNullable<PsionicsBlock["powersKnown"]>[number], i: number) => {
    const setPower = (mut: (t: NonNullable<PsionicsBlock["powersKnown"]>[number]) => void) =>
      ensure((p) => {
        const t = p.powersKnown[i];
        if (t) mut(t);
      });
    return (
      <EntryCard
        key={pw.id}
        name={pw.name}
        nameLabel="Power"
        onNameChange={(v) => setPower((t) => (t.name = v))}
        onRemove={() => ensure((p) => p.powersKnown.splice(i, 1))}
        removeLabel={`Remove ${pw.name}`}
        defaultOpen={pw.id === openPowerId}
        chips={
          <>
            <StatChip label="lvl" value={pw.level} tone="rune" />
            {pw.ppCost != null && <StatChip label="pp" value={pw.ppCost} tone="gold" />}
            {pw.discipline && <StatChip value={pw.discipline} />}
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            label="Level"
            value={pw.level}
            min={0}
            max={9}
            onChange={(v) => setPower((t) => (t.level = Math.max(0, Math.min(9, v))))}
            className="w-16"
          />
          <NumberField
            label="PP cost"
            value={pw.ppCost ?? 0}
            min={0}
            onChange={(v) => setPower((t) => (t.ppCost = v || undefined))}
            className="w-20"
          />
          <TextField
            label="Discipline"
            value={pw.discipline ?? ""}
            onChange={(v) => setPower((t) => (t.discipline = v || undefined))}
            className="min-w-[10rem] flex-1"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Display"
            value={pw.display ?? ""}
            onChange={(v) => setPower((t) => (t.display = v || undefined))}
            className="min-w-[8rem] flex-1"
          />
          <TextField
            label="Range"
            value={pw.range ?? ""}
            onChange={(v) => setPower((t) => (t.range = v || undefined))}
            className="min-w-[8rem] flex-1"
          />
          <TextField
            label="Duration"
            value={pw.duration ?? ""}
            onChange={(v) => setPower((t) => (t.duration = v || undefined))}
            className="min-w-[8rem] flex-1"
          />
        </div>
        <TextAreaField
          label="Description"
          value={pw.description ?? ""}
          onChange={(v) => setPower((t) => (t.description = v || undefined))}
          rows={3}
        />
        <TextAreaField
          label="Augment"
          value={pw.augment ?? ""}
          onChange={(v) => setPower((t) => (t.augment = v || undefined))}
          rows={2}
        />
      </EntryCard>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        A power-point pool spent on powers known. You can never spend more PP on one manifestation than
        your manifester level ({summary?.maxPowerCost ?? 0}).
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <span className="text-sm font-medium text-foreground">Power points</span>
        <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => spendPP(-1)}>
          − Spend
        </Button>
        <span className="tnum text-xl font-semibold text-rune">
          {current}
          <span className="text-base text-muted-foreground">/{max}</span>
        </span>
        <Button size="sm" variant="outline" disabled={current >= max} onClick={() => spendPP(1)}>
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ensure((p) => (p.powerPointsCurrent = max))}>
          Rest
        </Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={!!ps?.psionicFocus}
            onChange={(e) => ensure((p) => (p.psionicFocus = e.target.checked || undefined))}
          />
          Psionically focused
        </label>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Psionic classes</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              ensure((p) =>
                p.classes.push({
                  id: newId("psi"),
                  className: "Psion",
                  manifesterLevel: 1,
                  keyAbility: "int",
                  basePowerPoints: 0,
                  discipline: "generalist",
                }),
              )
            }
          >
            <Plus className="size-4" /> Class
          </Button>
        </div>
        {(ps?.classes.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No psionic classes yet.</p>}
        <div className="space-y-2">
          {ps?.classes.map((cl, i) => {
            const keyMod = ed.computed.abilities[cl.keyAbility]?.modifier ?? 0;
            return (
              <div key={cl.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
                <TextField
                  label="Class"
                  value={cl.className}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.className = v; })}
                  className="min-w-[8rem] flex-1"
                />
                <NumberField
                  label="ML"
                  value={cl.manifesterLevel}
                  min={0}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.manifesterLevel = v; })}
                  className="w-16"
                />
                <SelectField
                  label="Key"
                  value={cl.keyAbility}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.keyAbility = v; })}
                  options={[
                    { value: "int", label: "INT" },
                    { value: "wis", label: "WIS" },
                    { value: "cha", label: "CHA" },
                  ]}
                  className="w-20"
                />
                <NumberField
                  label="Base PP"
                  value={cl.basePowerPoints}
                  min={0}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.basePowerPoints = v; })}
                  className="w-20"
                />
                <SelectField
                  label="Discipline"
                  value={cl.discipline}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.discipline = v as PsionicsBlock["classes"][number]["discipline"]; })}
                  options={PSIONIC_DISCIPLINES.map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))}
                  className="w-36"
                />
                <span className="pb-2 text-xs text-muted-foreground">+{bonusPowerPoints(keyMod, cl.manifesterLevel)} PP</span>
                <Button variant="ghost" size="icon" aria-label="Remove class" onClick={() => ensure((p) => p.classes.splice(i, 1))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Powers known ({ps?.powersKnown.length ?? 0})</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={powerPickerOpen ? "default" : "secondary"} onClick={() => setPowerPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = newId("pow");
                ensure((p) => p.powersKnown.push({ id, name: "New power", level: 1 }));
                setOpenPowerId(id);
              }}
            >
              <Plus className="size-4" /> Power
            </Button>
          </div>
        </div>
        {powerPickerOpen && (
          <div className="mb-3">
            <PowerPicker ed={ed} onClose={() => setPowerPickerOpen(false)} />
          </div>
        )}
        <div className="space-y-2">
          {powerGroups.map((g) => (
            <CollapsibleGroup
              key={g.level}
              title={g.level === 0 ? "Talents" : `Level ${g.level}`}
              count={g.powers.length}
              defaultOpen={powersOpenByDefault}
              forceOpen={openPowerId != null && g.powers.some((p) => p.id === openPowerId)}
            >
              {g.powers.map((pw) => renderPower(pw, powerIndexById.get(pw.id)!))}
            </CollapsibleGroup>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-border/60 p-2">
          <p className="mb-1 text-xs font-medium text-foreground">Paste powers to import</p>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Paste one or more power statblocks (blank line between them). Name, level, discipline, PP, and
            augment are read automatically; the full text is kept so nothing is lost. A searchable
            compendium lands in a later pass.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Energy Ray\nDiscipline psychokinesis; Level psion/wilder 1\nPower Points 1\nYou project a ray…"}
            rows={4}
            className="w-full rounded-md border border-border bg-background p-2 text-xs text-foreground"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={!pasteText.trim()} onClick={importPowers}>
              Parse &amp; add
            </Button>
            {pasteMsg && <span className="text-xs text-muted-foreground">{pasteMsg}</span>}
          </div>
        </div>
      </section>
    </div>
  );
}
