"use client";

import { Plus, Trash2, Sparkles, BookOpen, Wand2 } from "lucide-react";
import type { SpellcasterEntry } from "@pathforge/schema";
import { NumberField, TextField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";

const CASTER_TYPES: SpellcasterEntry["casterType"][] = ["prepared", "spontaneous", "spellbook", "hybrid"];
const CASTING_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function SpellcastingEditor({ ed }: { ed: CharacterEditorApi }) {
  const sc = ed.draft.spellcasting;

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
                <div className="space-y-1">
                  <span className="block text-[11px] text-muted-foreground">Type</span>
                  <select
                    value={caster.casterType}
                    aria-label={`${caster.className} caster type`}
                    onChange={(e) => updateCaster(i, { casterType: e.target.value as SpellcasterEntry["casterType"] })}
                    className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {CASTER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] text-muted-foreground">Ability</span>
                  <select
                    value={caster.castingAbility}
                    aria-label={`${caster.className} casting ability`}
                    onChange={(e) => updateCaster(i, { castingAbility: e.target.value })}
                    className="h-10 rounded-lg border border-border bg-background px-2 text-sm uppercase text-foreground"
                  >
                    {CASTING_ABILITIES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <NumberField
                  label="Caster lvl"
                  value={typeof caster.casterLevel === "number" ? caster.casterLevel : 0}
                  min={0}
                  onChange={(v) => updateCaster(i, { casterLevel: v })}
                  className="w-24"
                />
                <Button variant="ghost" size="icon" aria-label={`Remove ${caster.className}`} onClick={() => ed.update((c) => c.spellcasting.casters.splice(i, 1))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Spells / day · levels 0–9</span>
                <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                  {SPELL_LEVELS.map((lvl) => (
                    <label key={lvl} className="text-center">
                      <span className="block text-[10px] text-muted-foreground">{lvl}</span>
                      <input
                        type="number"
                        min={0}
                        aria-label={`${caster.className} level ${lvl} spells per day`}
                        value={caster.spellsPerDay[String(lvl)]?.total ?? ""}
                        onChange={(e) => setSlots(i, lvl, e.target.value === "" ? null : Math.trunc(Number(e.target.value)))}
                        className="tnum h-8 w-full rounded-md border border-border bg-background px-1 text-center text-xs"
                      />
                    </label>
                  ))}
                </div>
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
          <Button size="sm" variant="secondary" onClick={() => ed.update((c) => c.spellcasting.knownSpells.push({ id: newId("spell"), name: "New spell", level: 0 }))}>
            <Plus className="size-4" /> Add spell
          </Button>
        </div>
        {sc.knownSpells.length === 0 && <p className="text-sm text-muted-foreground">No spells listed yet.</p>}
        <div className="space-y-2">
          {sc.knownSpells.map((sp, i) => (
            <div key={sp.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
              <TextField label="Spell" value={sp.name} onChange={(v) => ed.update((c) => { const s = c.spellcasting.knownSpells[i]; if (s) s.name = v; })} className="min-w-[10rem] flex-1" />
              <NumberField label="Lvl" value={sp.level} min={0} max={9} onChange={(v) => ed.update((c) => { const s = c.spellcasting.knownSpells[i]; if (s) s.level = Math.max(0, Math.min(9, v)); })} className="w-16" />
              <TextField label="School" value={sp.school ?? ""} onChange={(v) => ed.update((c) => { const s = c.spellcasting.knownSpells[i]; if (s) s.school = v; })} className="w-32" />
              <Button variant="ghost" size="icon" aria-label={`Remove ${sp.name}`} onClick={() => ed.update((c) => c.spellcasting.knownSpells.splice(i, 1))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Spell-like abilities */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Wand2 className="size-4" /> Spell-like abilities &amp; metamagic
          </h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => ed.update((c) => c.spellcasting.spellLikeAbilities.push({ id: newId("sla"), name: "New ability", used: 0 }))}>
              <Plus className="size-4" /> SLA
            </Button>
            <Button size="sm" variant="ghost" onClick={() => ed.update((c) => c.spellcasting.metamagic.push({ id: newId("meta"), name: "New metamagic", levelAdjust: 0 }))}>
              <Plus className="size-4" /> Metamagic
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
