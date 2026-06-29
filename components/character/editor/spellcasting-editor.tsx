"use client";

import { useState } from "react";
import { Plus, Trash2, BookOpen, Search } from "lucide-react";
import { Sparkles, Wand2 } from "@/components/ui/game-icons";
import type { SpellcasterEntry } from "@pathforge/schema";
import { METAMAGIC_CATALOG } from "@pathforge/schema";
import type { ComputedSpellSlots } from "@pathforge/rules-pf1e";
import { NumberField, SelectField, TextField } from "./fields";
import { SpellPicker } from "./spell-picker";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CASTER_TYPES: SpellcasterEntry["casterType"][] = ["prepared", "spontaneous", "spellbook", "hybrid"];
const CASTING_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function SpellcastingEditor({ ed }: { ed: CharacterEditorApi }) {
  const sc = ed.draft.spellcasting;
  const [showPicker, setShowPicker] = useState(false);

  const addCaster = () =>
    ed.update((c) =>
      c.spellcasting.casters.push({
        id: newId("caster"),
        className: "Wizard",
        casterType: "prepared",
        casterLevel: 0,
        concentrationFormula: "",
        castingAbility: "int",
        conditionalModifiers: [],
        spellsPerDay: {},
        bonusSpells: {},
        saveDcFormula: "",
        autoSlots: false,
      }),
    );
  const updateCaster = (i: number, patch: Partial<SpellcasterEntry>) =>
    ed.update((c) => {
      const caster = c.spellcasting.casters[i];
      if (caster) Object.assign(caster, patch);
    });
  const setSlots = (i: number, level: number, total: number | null) =>
    ed.update((c) => {
      const caster = c.spellcasting.casters[i];
      if (!caster) return;
      const key = String(level);
      const existing = caster.spellsPerDay[key];
      // Empty (null) or 0 with nothing tracked → drop the level; otherwise keep
      // any `used`/`bonus` so clearing-and-retyping the total doesn't lose them.
      if ((total === null || total === 0) && !existing?.used && !existing?.bonus) {
        delete caster.spellsPerDay[key];
        return;
      }
      caster.spellsPerDay[key] = { used: existing?.used ?? 0, bonus: existing?.bonus, total: total ?? 0 };
    });

  const isPrepared = (caster: SpellcasterEntry) =>
    caster.casterType === "prepared" || caster.casterType === "spellbook";

  // Spontaneous: cast/uncast a level slot (the per-level `used`), clamped to [0, total].
  const castLevel = (i: number, level: number, delta: number, max: number) =>
    ed.update((c) => {
      const caster = c.spellcasting.casters[i];
      if (!caster) return;
      const key = String(level);
      const slot = caster.spellsPerDay[key] ?? { used: 0, total: 0 };
      slot.used = Math.max(0, Math.min(max, (slot.used ?? 0) + delta));
      caster.spellsPerDay[key] = slot;
    });

  // Rest: reset all of this caster's usage (per-level slots + its prepared spells).
  const restCaster = (i: number) =>
    ed.update((c) => {
      const caster = c.spellcasting.casters[i];
      if (!caster) return;
      for (const slot of Object.values(caster.spellsPerDay)) if (slot) slot.used = 0;
      for (const sp of c.spellcasting.preparedSpells) if (sp.casterId === caster.id) sp.used = 0;
    });

  const preparedCaster = sc.casters.find(isPrepared);
  const multiplePrepared = sc.casters.filter(isPrepared).length > 1;

  const prepareFromKnown = (known: (typeof sc.knownSpells)[number]) =>
    ed.update((c) => {
      const preparedCasters = c.spellcasting.casters.filter(isPrepared);
      // Route to the spell's own caster if it's prepared, else the first prepared caster.
      const target = preparedCasters.find((pc) => pc.id === known.casterId) ?? preparedCasters[0];
      if (!target) return;
      // Re-preparing the same spell bumps its count instead of adding a duplicate row.
      const existing = c.spellcasting.preparedSpells.find(
        (s) => s.spellbookEntryId === known.id && s.casterId === target.id,
      );
      if (existing) {
        existing.prepared = (existing.prepared ?? 1) + 1;
        return;
      }
      c.spellcasting.preparedSpells.push({
        ...known,
        id: newId("prep"),
        casterId: target.id,
        spellbookEntryId: known.id,
        prepared: 1,
        used: 0,
        metamagicIds: [],
      });
    });

  // Adjust the prepared count; floored at 1 (removal is the explicit trash button only).
  const adjustPrepared = (id: string, deltaCount: number) =>
    ed.update((c) => {
      const sp = c.spellcasting.preparedSpells.find((s) => s.id === id);
      if (!sp) return;
      const next = Math.max(1, (sp.prepared ?? 1) + deltaCount);
      sp.prepared = next;
      if ((sp.used ?? 0) > next) sp.used = next;
    });

  const castPrepared = (id: string, delta: number) =>
    ed.update((c) => {
      const sp = c.spellcasting.preparedSpells.find((s) => s.id === id);
      if (!sp) return;
      sp.used = Math.max(0, Math.min(sp.prepared ?? 1, (sp.used ?? 0) + delta));
    });

  const removePrepared = (id: string) =>
    ed.update((c) => {
      const idx = c.spellcasting.preparedSpells.findIndex((s) => s.id === id);
      if (idx >= 0) c.spellcasting.preparedSpells.splice(idx, 1);
    });

  const toggleMetamagic = (spellId: string, metaId: string) =>
    ed.update((c) => {
      const sp = c.spellcasting.preparedSpells.find((s) => s.id === spellId);
      if (!sp) return;
      const ids = sp.metamagicIds ?? [];
      sp.metamagicIds = ids.includes(metaId) ? ids.filter((x) => x !== metaId) : [...ids, metaId];
    });

  /** Add a standard metamagic feat from the catalog (no-op if already present by id). */
  const addCatalogMetamagic = (catalogId: string) =>
    ed.update((c) => {
      const entry = METAMAGIC_CATALOG.find((m) => m.id === catalogId);
      if (!entry || c.spellcasting.metamagic.some((m) => m.id === entry.id)) return;
      c.spellcasting.metamagic.push({ id: entry.id, name: entry.name, levelAdjust: entry.levelAdjust });
    });

  const effLevelOf = (sp: { level: number; metamagicIds?: string[] }) =>
    sp.level +
    (sp.metamagicIds ?? []).reduce((s, id) => s + (sc.metamagic.find((m) => m.id === id)?.levelAdjust ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Casters */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-rune" /> Casting classes
          </h3>
          <Button size="sm" variant="secondary" onClick={addCaster}>
            <Plus className="size-4" /> Add caster
          </Button>
        </div>
        {sc.casters.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No casting classes yet. Add one to track caster level, save DCs, and spells per day.
          </p>
        )}
        <div className="space-y-3">
          {sc.casters.map((caster, i) => (
            <div key={caster.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <TextField label="Class" value={caster.className} onChange={(v) => updateCaster(i, { className: v })} className="min-w-[9rem] flex-1" />
                <SelectField
                  label="Type"
                  value={caster.casterType}
                  options={CASTER_TYPES.map((t) => ({ value: t, label: t }))}
                  onChange={(v) => updateCaster(i, { casterType: v as SpellcasterEntry["casterType"] })}
                  className="w-[8rem]"
                />
                <SelectField
                  label="Ability"
                  value={caster.castingAbility}
                  options={CASTING_ABILITIES.map((a) => ({ value: a, label: a.toUpperCase() }))}
                  onChange={(v) => updateCaster(i, { castingAbility: v })}
                  className="w-24"
                />
                <NumberField
                  label="Caster lvl"
                  value={typeof caster.casterLevel === "number" ? caster.casterLevel : 0}
                  min={0}
                  onChange={(v) => updateCaster(i, { casterLevel: v })}
                  className="w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${caster.className}`}
                  onClick={() =>
                    ed.update((c) => {
                      const removed = c.spellcasting.casters[i];
                      c.spellcasting.casters.splice(i, 1);
                      // Drop prepared spells orphaned by the removed caster.
                      if (removed)
                        c.spellcasting.preparedSpells = c.spellcasting.preparedSpells.filter(
                          (s) => s.casterId !== removed.id,
                        );
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Spells per day</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={caster.autoSlots}
                        onChange={(e) => updateCaster(i, { autoSlots: e.target.checked })}
                      />
                      Auto
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => restCaster(i)}>
                      Rest
                    </Button>
                  </div>
                </div>
                {!caster.autoSlots && (
                  <div className="mb-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                    {SPELL_LEVELS.map((lvl) => (
                      <label key={lvl} className="text-center">
                        <span className="block text-[10px] text-muted-foreground">{lvl}</span>
                        <input
                          type="number"
                          min={0}
                          aria-label={`${caster.className} level ${lvl} spells per day`}
                          value={caster.spellsPerDay[String(lvl)]?.total ?? ""}
                          onChange={(e) => setSlots(i, lvl, e.target.value === "" ? null : Math.trunc(Number(e.target.value)))}
                          className="tnum h-10 w-full rounded-md border border-border bg-background px-1 text-center text-xs sm:h-9"
                        />
                      </label>
                    ))}
                  </div>
                )}
                <SlotTracker
                  slots={ed.computed.spellcasting.find((s) => s.casterId === caster.id)?.slots ?? []}
                  spontaneous={!isPrepared(caster)}
                  onCast={(lvl, d, total) => castLevel(i, lvl, d, total)}
                />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <TextField label="Save DC formula" value={caster.saveDcFormula} onChange={(v) => updateCaster(i, { saveDcFormula: v })} placeholder="10 + spell level + @{abilities.int.mod}" className="font-mono" />
                <TextField label="Concentration formula" value={caster.concentrationFormula} onChange={(v) => updateCaster(i, { concentrationFormula: v })} placeholder="@{casterLevel} + @{abilities.int.mod}" className="font-mono" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Spells known / prepared */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <BookOpen className="size-4" /> Spells
          </h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={showPicker ? "secondary" : "ghost"} onClick={() => setShowPicker((v) => !v)}>
              <Search className="size-4" /> Search compendium
            </Button>
            <Button size="sm" variant="secondary" onClick={() => ed.update((c) => c.spellcasting.knownSpells.push({ id: newId("spell"), name: "New spell", level: 0 }))}>
              <Plus className="size-4" /> Add manually
            </Button>
          </div>
        </div>
        {showPicker && (
          <div className="mb-3">
            <SpellPicker ed={ed} onClose={() => setShowPicker(false)} />
          </div>
        )}
        {sc.knownSpells.length === 0 && <p className="text-sm text-muted-foreground">No spells listed yet.</p>}
        <div className="space-y-2">
          {sc.knownSpells.map((sp, i) => (
            <div key={sp.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
              <TextField label="Spell" value={sp.name} onChange={(v) => ed.update((c) => { const s = c.spellcasting.knownSpells[i]; if (s) s.name = v; })} className="min-w-[10rem] flex-1" />
              <NumberField label="Lvl" value={sp.level} min={0} max={9} onChange={(v) => ed.update((c) => { const s = c.spellcasting.knownSpells[i]; if (s) s.level = Math.max(0, Math.min(9, v)); })} className="w-16" />
              <TextField label="School" value={sp.school ?? ""} onChange={(v) => ed.update((c) => { const s = c.spellcasting.knownSpells[i]; if (s) s.school = v; })} className="w-32" />
              {preparedCaster && (
                <Button size="sm" variant="ghost" onClick={() => prepareFromKnown(sp)}>
                  Prepare
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label={`Remove ${sp.name}`} onClick={() => ed.update((c) => c.spellcasting.knownSpells.splice(i, 1))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        {preparedCaster && sc.preparedSpells.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prepared today
            </h4>
            <div className="space-y-1.5">
              {[...sc.preparedSpells]
                .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
                .map((sp) => (
                  <div
                    key={sp.id}
                    className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-surface-raised/30 px-2 py-1.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-foreground">{sp.name}</span>
                      {multiplePrepared && (
                        <span className="shrink-0 truncate text-[10px] text-muted-foreground">
                          {sc.casters.find((c) => c.id === sp.casterId)?.className}
                        </span>
                      )}
                      <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        L{sp.level}
                        {effLevelOf(sp) !== sp.level ? ` → ${effLevelOf(sp)}` : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 px-2"
                        aria-label={`Remove prepared ${sp.name}`}
                        onClick={() => removePrepared(sp.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={(sp.prepared ?? 1) <= 1}
                          aria-label={`Prepare one fewer of ${sp.name}`}
                          onClick={() => adjustPrepared(sp.id, -1)}
                        >
                          −
                        </Button>
                        <span className="tnum">{sp.prepared}× prep</span>
                        <Button size="sm" variant="ghost" aria-label={`Prepare one more of ${sp.name}`} onClick={() => adjustPrepared(sp.id, 1)}>
                          +
                        </Button>
                      </span>
                      <span className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={(sp.used ?? 0) >= (sp.prepared ?? 1)}
                          aria-label={`Cast ${sp.name}`}
                          onClick={() => castPrepared(sp.id, 1)}
                        >
                          Cast
                        </Button>
                        <span className="tnum text-xs text-muted-foreground">
                          {sp.used ?? 0}/{sp.prepared}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={(sp.used ?? 0) <= 0}
                          aria-label={`Undo cast ${sp.name}`}
                          onClick={() => castPrepared(sp.id, -1)}
                        >
                          −
                        </Button>
                      </span>
                    </div>
                    {sc.metamagic.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Metamagic</span>
                        {sc.metamagic.map((m) => {
                          const on = (sp.metamagicIds ?? []).includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleMetamagic(sp.id, m.id)}
                              aria-pressed={on}
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px]",
                                on ? "border-rune bg-rune/15 text-rune" : "border-border text-muted-foreground hover:border-rune/50",
                              )}
                            >
                              {m.name} +{m.levelAdjust}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>

      {/* Spell-like abilities */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Wand2 className="size-4" /> Spell-like abilities &amp; metamagic
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => ed.update((c) => c.spellcasting.spellLikeAbilities.push({ id: newId("sla"), name: "New ability", used: 0 }))}>
              <Plus className="size-4" /> SLA
            </Button>
            <select
              aria-label="Add a standard metamagic feat"
              value=""
              onChange={(e) => {
                if (e.target.value) addCatalogMetamagic(e.target.value);
                e.target.value = "";
              }}
              className="h-8 rounded border border-border bg-background px-1 text-xs text-foreground"
            >
              <option value="">+ Standard metamagic…</option>
              {METAMAGIC_CATALOG.filter((m) => !sc.metamagic.some((k) => k.id === m.id)).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (+{m.levelAdjust})
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={() => ed.update((c) => c.spellcasting.metamagic.push({ id: newId("meta"), name: "New metamagic", levelAdjust: 0 }))}>
              <Plus className="size-4" /> Custom
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {sc.spellLikeAbilities.map((sla, i) => (
            <div key={sla.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
              <TextField label="Spell-like ability" value={sla.name} onChange={(v) => ed.update((c) => { const s = c.spellcasting.spellLikeAbilities[i]; if (s) s.name = v; })} className="min-w-[10rem] flex-1" />
              <NumberField label="Uses/day" value={typeof sla.usesPerDay === "number" ? sla.usesPerDay : 0} min={0} onChange={(v) => ed.update((c) => { const s = c.spellcasting.spellLikeAbilities[i]; if (s) s.usesPerDay = v; })} className="w-24" />
              <Button variant="ghost" size="icon" aria-label={`Remove ${sla.name}`} onClick={() => ed.update((c) => c.spellcasting.spellLikeAbilities.splice(i, 1))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {sc.metamagic.map((m, i) => (
            <div key={m.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
              <TextField label="Metamagic feat" value={m.name} onChange={(v) => ed.update((c) => { const s = c.spellcasting.metamagic[i]; if (s) s.name = v; })} className="min-w-[10rem] flex-1" />
              <NumberField label="+Levels" value={m.levelAdjust} min={0} onChange={(v) => ed.update((c) => { const s = c.spellcasting.metamagic[i]; if (s) s.levelAdjust = v; })} className="w-24" />
              <Button variant="ghost" size="icon" aria-label={`Remove ${m.name}`} onClick={() => ed.update((c) => c.spellcasting.metamagic.splice(i, 1))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Live per-level slot tracker driven by the engine: remaining/total + DC, with Cast/undo for spontaneous casters. */
function SlotTracker({
  slots,
  spontaneous,
  onCast,
}: {
  slots: ComputedSpellSlots[];
  spontaneous: boolean;
  onCast: (level: number, delta: number, total: number) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div className="space-y-1">
      {slots.map((s) => (
        <div key={s.level} className="flex items-center gap-2 text-xs">
          <span className="w-12 shrink-0 text-muted-foreground">Lvl {s.level}</span>
          <span className="tnum text-foreground">
            {s.remaining}/{s.total}
          </span>
          <span className="text-[11px] text-muted-foreground">DC {s.dc}</span>
          {spontaneous ? (
            <span className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={s.used >= s.total}
                aria-label={`Cast a level ${s.level} spell`}
                onClick={() => onCast(s.level, 1, s.total)}
              >
                Cast
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={s.used <= 0}
                aria-label={`Undo a level ${s.level} cast`}
                onClick={() => onCast(s.level, -1, s.total)}
              >
                −
              </Button>
            </span>
          ) : (
            s.prepared > 0 && <span className="ml-auto text-[11px] text-muted-foreground">{s.prepared} prepared</span>
          )}
        </div>
      ))}
    </div>
  );
}
