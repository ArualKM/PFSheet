"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Loader2,
  Cloud,
  Undo2,
  Plus,
  Trash2,
  ExternalLink,
  Sigma,
} from "lucide-react";
import { ABILITY_KEYS, type PathForgeCharacterV1, type AbilityKey, type ModifierEntry } from "@pathforge/schema";
import type { ComputedValue } from "@pathforge/rules-pf1e";
import { useCharacterEditor, type SaveStatus } from "./use-character-editor";
import { NumberField, TextField, TextAreaField } from "./fields";
import { BuffCenter } from "./buff-center";
import { CombatEditor } from "./combat-editor";
import { InventoryEditor } from "./inventory-editor";
import { SpellcastingEditor } from "./spellcasting-editor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatModifier } from "@/lib/utils";

const TABS = ["Identity", "Abilities", "Health", "Saves", "AC", "Combat", "Skills", "Feats", "Buffs", "Spells", "Inventory", "Profile"] as const;
type Tab = (typeof TABS)[number];

const AC_COMPONENTS = [
  { key: "armor", label: "Armor", bonusType: "armor" },
  { key: "shield", label: "Shield", bonusType: "shield" },
  { key: "natural", label: "Natural armor", bonusType: "natural_armor" },
  { key: "deflection", label: "Deflection", bonusType: "deflection" },
  { key: "dodge", label: "Dodge", bonusType: "dodge" },
  { key: "misc", label: "Misc (untyped)", bonusType: "untyped" },
] as const;

const FEATURE_CATEGORIES = [
  "racial_trait",
  "class_feature",
  "archetype_feature",
  "special_ability",
  "defensive_feature",
  "offensive_feature",
  "misc",
] as const;

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export function CharacterEditor({
  characterId,
  initial,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
}) {
  const ed = useCharacterEditor(characterId, initial);
  const [tab, setTab] = useState<Tab>("Identity");
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={tab === t ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              aria-pressed={advanced}
              title="Toggle Simple / Advanced mode"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                advanced
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Sigma className="size-3.5" /> {advanced ? "Advanced" : "Simple"}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={ed.undo}
              disabled={!ed.canUndo}
              title="Undo last change"
            >
              <Undo2 className="size-4" /> Undo
            </Button>
            <SaveStatusBadge status={ed.status} error={ed.error} />
          </div>
        </div>

        <Card>
          <CardContent className="p-5">
            {tab === "Identity" && <IdentityEditor ed={ed} />}
            {tab === "Abilities" && <AbilitiesEditor ed={ed} advanced={advanced} />}
            {tab === "Health" && <HealthEditor ed={ed} />}
            {tab === "Saves" && <SavesEditor ed={ed} />}
            {tab === "AC" && <ACEditor ed={ed} />}
            {tab === "Combat" && <CombatEditor ed={ed} />}
            {tab === "Skills" && <SkillsEditor ed={ed} />}
            {tab === "Feats" && <FeatsEditor ed={ed} />}
            {tab === "Buffs" && <BuffCenter ed={ed} />}
            {tab === "Spells" && <SpellcastingEditor ed={ed} />}
            {tab === "Inventory" && <InventoryEditor ed={ed} />}
            {tab === "Profile" && <ProfileEditor ed={ed} />}
          </CardContent>
        </Card>
      </div>

      <aside className="h-fit lg:sticky lg:top-20">
        <LivePreview ed={ed} characterId={characterId} advanced={advanced} />
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editors                                                                    */
/* -------------------------------------------------------------------------- */

type EditorApi = ReturnType<typeof useCharacterEditor>;

function IdentityEditor({ ed }: { ed: EditorApi }) {
  const id = ed.draft.identity;
  const prog = ed.draft.progression;
  const [fav, setFav] = useState("");

  const addFavored = () => {
    const v = fav.trim();
    if (!v) return;
    ed.update((c) => {
      if (!c.progression.favoredClasses.includes(v)) c.progression.favoredClasses.push(v);
    });
    setFav("");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Name" value={id.name} onChange={(v) => ed.update((c) => (c.identity.name = v))} />
        <TextField label="Player" value={id.playerName ?? ""} onChange={(v) => ed.update((c) => (c.identity.playerName = v || undefined))} />
        <TextField label="Race" value={id.race ?? ""} onChange={(v) => ed.update((c) => (c.identity.race = v || undefined))} />
        <TextField label="Alignment" value={id.alignment ?? ""} onChange={(v) => ed.update((c) => (c.identity.alignment = v || undefined))} placeholder="LG, N, CE…" />
        <TextField label="Size" value={id.size ?? ""} onChange={(v) => ed.update((c) => (c.identity.size = v || undefined))} placeholder="Medium" />
        <TextField label="Deity" value={id.deity ?? ""} onChange={(v) => ed.update((c) => (c.identity.deity = v || undefined))} />
        <TextField label="Homeland" value={id.homeland ?? ""} onChange={(v) => ed.update((c) => (c.identity.homeland = v || undefined))} />
        <TextField label="Ethnicity" value={id.ethnicity ?? ""} onChange={(v) => ed.update((c) => (c.identity.ethnicity = v || undefined))} />
        <TextField label="Gender" value={id.gender ?? ""} onChange={(v) => ed.update((c) => (c.identity.gender = v || undefined))} />
        <TextField label="Age" value={id.age ?? ""} onChange={(v) => ed.update((c) => (c.identity.age = v || undefined))} />
        <TextField label="Height" value={id.height ?? ""} onChange={(v) => ed.update((c) => (c.identity.height = v || undefined))} />
        <TextField label="Weight" value={id.weight ?? ""} onChange={(v) => ed.update((c) => (c.identity.weight = v || undefined))} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Classes</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              ed.update((c) => {
                c.identity.classes.push({
                  id: `class_${c.identity.classes.length + 1}_${Date.now().toString(36)}`,
                  name: "Class",
                  level: 1,
                });
                c.identity.totalLevel = c.identity.classes.reduce((s, cl) => s + cl.level, 0);
              })
            }
          >
            <Plus className="size-4" /> Add class
          </Button>
        </div>
        <div className="space-y-2">
          {id.classes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No classes yet. Add a class to set your level and hit dice.
            </p>
          )}
          {id.classes.map((cl, i) => (
            <div key={cl.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <TextField
                label="Class"
                value={cl.name}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.name = v;
                  })
                }
                className="flex-1"
              />
              <TextField
                label="Archetype"
                value={cl.archetype ?? ""}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.archetype = v || undefined;
                  })
                }
                className="w-32"
              />
              <NumberField
                label="Level"
                value={cl.level}
                min={0}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.level = v;
                    c.identity.totalLevel = c.identity.classes.reduce((s, x) => s + x.level, 0);
                  })
                }
                className="w-20"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove class"
                onClick={() =>
                  ed.update((c) => {
                    c.identity.classes.splice(i, 1);
                    c.identity.totalLevel = c.identity.classes.reduce((s, x) => s + x.level, 0);
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Total level: <span className="font-semibold text-foreground">{id.totalLevel}</span>
        </p>
      </div>

      <NumberField
        label="Base attack bonus (BAB)"
        value={typeof ed.draft.combat.bab.total === "number" ? ed.draft.combat.bab.total : 0}
        min={0}
        onChange={(v) => ed.update((c) => (c.combat.bab.total = v))}
        hint="Drives melee/ranged attack and CMB/CMD."
        className="max-w-xs"
      />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Advancement</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Current XP"
            value={prog.currentXp ?? 0}
            min={0}
            onChange={(v) => ed.update((c) => (c.progression.currentXp = v || undefined))}
          />
          <NumberField
            label="Next level XP"
            value={prog.nextLevelXp ?? 0}
            min={0}
            onChange={(v) => ed.update((c) => (c.progression.nextLevelXp = v || undefined))}
          />
          <div className="space-y-1">
            <span className="block text-sm font-medium leading-none text-foreground">XP track</span>
            <select
              value={prog.xpTrack ?? "medium"}
              aria-label="XP track"
              onChange={(e) =>
                ed.update((c) => (c.progression.xpTrack = e.target.value as "slow" | "medium" | "fast" | "custom"))
              }
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              {["slow", "medium", "fast", "custom"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <span className="mb-1 block text-sm font-medium text-foreground">Favored classes</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {prog.favoredClasses.length === 0 && <span className="text-sm text-muted-foreground">None.</span>}
            {prog.favoredClasses.map((fc, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-foreground">
                {fc}
                <button
                  type="button"
                  aria-label={`Remove ${fc}`}
                  onClick={() => ed.update((c) => c.progression.favoredClasses.splice(i, 1))}
                  className="text-muted-foreground hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex max-w-sm gap-2">
            <input
              value={fav}
              placeholder="Class name…"
              aria-label="Add favored class"
              onChange={(e) => setFav(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFavored();
                }
              }}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            />
            <Button size="sm" variant="secondary" onClick={addFavored}>
              Add
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

const ABILITY_ADJUSTS = [
  { key: "enhancement", label: "Enh" },
  { key: "inherent", label: "Inherent" },
  { key: "tempAdjust", label: "Temp" },
  { key: "damage", label: "Damage" },
  { key: "penalty", label: "Penalty" },
  { key: "drain", label: "Drain" },
] as const;

function AbilitiesEditor({ ed, advanced }: { ed: EditorApi; advanced: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter each ability score; modifiers update live and flow into AC, saves, attacks, and skills.
        {advanced && " Advanced: enhancement/inherent stack by type (highest wins); damage, penalty, and drain reduce the effective score."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {ABILITY_KEYS.map((key) => {
          const score = ed.draft.abilities.primary[key];
          const comp = ed.computed.abilities[key];
          const mod = comp?.modifier ?? 0;
          return (
            <div key={key} className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{ABILITY_NAMES[key]}</span>
                <Badge variant="gold">{formatModifier(mod)}</Badge>
              </div>
              <NumberField
                label="Score"
                value={score?.score ?? 10}
                min={0}
                onChange={(v) =>
                  ed.update((c) => {
                    c.abilities.primary[key].score = v;
                  })
                }
              />
              {advanced && (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {ABILITY_ADJUSTS.map((f) => (
                      <NumberField
                        key={f.key}
                        label={f.label}
                        value={score?.[f.key] ?? 0}
                        onChange={(v) =>
                          ed.update((c) => {
                            c.abilities.primary[key][f.key] = v || undefined;
                          })
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Effective:{" "}
                    <span className="tnum text-foreground">{comp?.effectiveScore ?? score?.score ?? 10}</span>
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function newModId(): string {
  return `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function ModifierRows({
  title,
  valueLabel,
  labelPlaceholder,
  entries,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  valueLabel: string;
  labelPlaceholder: string;
  entries: ModifierEntry[];
  onAdd: () => void;
  onChange: (i: number, patch: Partial<ModifierEntry>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      {entries.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={e.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
            <NumberField
              label={valueLabel}
              value={typeof e.value === "number" ? e.value : Number(e.value) || 0}
              min={0}
              onChange={(v) => onChange(i, { value: v })}
              className="w-24"
            />
            <TextField
              label="Type / bypass"
              value={e.label}
              placeholder={labelPlaceholder}
              onChange={(v) => onChange(i, { label: v })}
              className="flex-1"
            />
            <Button variant="ghost" size="icon" aria-label="Remove entry" onClick={() => onRemove(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HealthEditor({ ed }: { ed: EditorApi }) {
  const h = ed.draft.health;
  const maxHp = typeof h.maxHp === "number" ? h.maxHp : 0;
  const [cond, setCond] = useState("");

  const addCondition = () => {
    const v = cond.trim();
    if (!v) return;
    ed.update((c) => {
      if (!c.health.conditions.includes(v)) c.health.conditions.push(v);
    });
    setCond("");
  };

  return (
    <div className="space-y-6">
      <div className="grid max-w-xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Max HP" value={maxHp} min={0} onChange={(v) => ed.update((c) => (c.health.maxHp = v))} />
        <NumberField label="Current HP" value={h.currentHp} onChange={(v) => ed.update((c) => (c.health.currentHp = v))} />
        <NumberField label="Temp HP" value={h.tempHp} min={0} onChange={(v) => ed.update((c) => (c.health.tempHp = v))} />
        <NumberField label="Nonlethal" value={h.nonlethalDamage} min={0} onChange={(v) => ed.update((c) => (c.health.nonlethalDamage = v))} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Conditions</h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {h.conditions.length === 0 && <span className="text-sm text-muted-foreground">None.</span>}
          {h.conditions.map((label, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-foreground">
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => ed.update((c) => c.health.conditions.splice(i, 1))}
                className="text-muted-foreground hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex max-w-sm gap-2">
          <input
            value={cond}
            placeholder="Shaken, Fatigued, Prone…"
            aria-label="Add condition"
            onChange={(e) => setCond(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCondition();
              }
            }}
            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <Button size="sm" variant="secondary" onClick={addCondition}>
            Add
          </Button>
        </div>
      </section>

      <ModifierRows
        title="Damage reduction"
        valueLabel="DR"
        labelPlaceholder="magic, silver, cold iron…"
        entries={h.damageReduction}
        onAdd={() => ed.update((c) => c.health.damageReduction.push({ id: newModId(), label: "", value: 0, enabled: true }))}
        onChange={(i, patch) =>
          ed.update((c) => {
            const e = c.health.damageReduction[i];
            if (e) Object.assign(e, patch);
          })
        }
        onRemove={(i) => ed.update((c) => c.health.damageReduction.splice(i, 1))}
      />
      <ModifierRows
        title="Energy resistance"
        valueLabel="Resist"
        labelPlaceholder="fire, cold, acid…"
        entries={h.energyResistance}
        onAdd={() => ed.update((c) => c.health.energyResistance.push({ id: newModId(), label: "", value: 0, enabled: true }))}
        onChange={(i, patch) =>
          ed.update((c) => {
            const e = c.health.energyResistance[i];
            if (e) Object.assign(e, patch);
          })
        }
        onRemove={(i) => ed.update((c) => c.health.energyResistance.splice(i, 1))}
      />
    </div>
  );
}

function SavesEditor({ ed }: { ed: EditorApi }) {
  const s = ed.draft.defenses.savingThrows;
  const total = ed.computed.saves;
  const rows: Array<{ key: "fortitude" | "reflex" | "will"; label: string }> = [
    { key: "fortitude", label: "Fortitude" },
    { key: "reflex", label: "Reflex" },
    { key: "will", label: "Will" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enter the class base save; the ability modifier is added automatically.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{r.label}</span>
              <Badge variant="rune">{formatModifier(total[r.key].value)}</Badge>
            </div>
            <NumberField
              label="Base"
              value={s[r.key].base}
              onChange={(v) =>
                ed.update((c) => {
                  c.defenses.savingThrows[r.key].base = v;
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-2 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tnum text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ACEditor({ ed }: { ed: EditorApi }) {
  const mods = ed.draft.defenses.armorClass.conditionalModifiers;
  const getVal = (key: string): number => {
    const m = mods.find((x) => x.id === `ac_${key}`);
    if (!m) return 0;
    return typeof m.value === "number" ? m.value : Number(m.value) || 0;
  };
  const setVal = (comp: (typeof AC_COMPONENTS)[number], v: number) =>
    ed.update((c) => {
      const arr = c.defenses.armorClass.conditionalModifiers;
      const idx = arr.findIndex((x) => x.id === `ac_${comp.key}`);
      if (v === 0) {
        if (idx >= 0) arr.splice(idx, 1);
      } else if (idx >= 0) {
        const t = arr[idx];
        if (t) t.value = v;
      } else {
        arr.push({
          id: `ac_${comp.key}`,
          label: comp.label,
          value: v,
          bonusType: comp.bonusType,
          enabled: true,
        });
      }
    });

  const ac = ed.computed.armorClass;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter your AC component bonuses. Dexterity, size, and base attack bonus are applied
        automatically; touch and flat-footed are derived.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {AC_COMPONENTS.map((comp) => (
          <NumberField
            key={comp.key}
            label={comp.label}
            value={getVal(comp.key)}
            onChange={(v) => setVal(comp, v)}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="AC" value={ac.total.value} />
        <MiniStat label="Touch" value={ac.touch.value} />
        <MiniStat label="Flat-footed" value={ac.flatFooted.value} />
        <MiniStat label="CMD" value={ac.cmd.value} />
      </div>
    </div>
  );
}

function SkillsEditor({ ed }: { ed: EditorApi }) {
  const skills = ed.draft.skills.list;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Set ranks and mark class skills (trained class skills with ranks gain +3). Totals update live.
      </p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Skill</th>
              <th className="px-2 py-2 font-semibold">Ability</th>
              <th className="px-2 py-2 font-semibold">Class</th>
              <th className="w-20 px-2 py-2 font-semibold">Ranks</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s, i) => {
              const total = ed.computed.skills[s.key]?.value ?? 0;
              return (
                <tr key={s.id} className="border-t border-border/50">
                  <td className="px-3 py-1.5 text-foreground">
                    {s.label}
                    {s.trainedOnly && <span className="ml-1 text-[10px] text-muted-foreground">(trained)</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center text-[11px] uppercase text-muted-foreground">
                    {s.ability}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!s.classSkill}
                      aria-label={`${s.label} is a class skill`}
                      onChange={(e) =>
                        ed.update((c) => {
                          const t = c.skills.list[i];
                          if (t) t.classSkill = e.target.checked;
                        })
                      }
                      className="size-4 accent-[var(--pf-gold)]"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      value={s.ranks}
                      aria-label={`${s.label} ranks`}
                      onChange={(e) => {
                        const n = e.target.value === "" ? 0 : Number(e.target.value);
                        if (!Number.isNaN(n))
                          ed.update((c) => {
                            const t = c.skills.list[i];
                            if (t) t.ranks = n;
                          });
                      }}
                      className="tnum h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-semibold text-rune">
                    {formatModifier(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeatsEditor({ ed }: { ed: EditorApi }) {
  const feats = ed.draft.feats.list;
  const features = ed.draft.features.list;
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Feats</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              ed.update((c) =>
                c.feats.list.push({
                  id: `feat_${c.feats.list.length}_${Date.now().toString(36)}`,
                  name: "New Feat",
                  tags: [],
                  automation: [],
                }),
              )
            }
          >
            <Plus className="size-4" /> Add feat
          </Button>
        </div>
        {feats.length === 0 && <p className="text-sm text-muted-foreground">No feats yet.</p>}
        <div className="space-y-2">
          {feats.map((f, i) => (
            <div key={f.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <TextField
                label="Name"
                value={f.name}
                onChange={(v) =>
                  ed.update((c) => {
                    const t = c.feats.list[i];
                    if (t) t.name = v;
                  })
                }
                className="flex-1"
              />
              <TextField
                label="Type"
                value={f.type ?? ""}
                placeholder="Combat, General…"
                onChange={(v) =>
                  ed.update((c) => {
                    const t = c.feats.list[i];
                    if (t) t.type = v;
                  })
                }
                className="w-36"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove feat"
                onClick={() => ed.update((c) => c.feats.list.splice(i, 1))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Features &amp; abilities</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              ed.update((c) =>
                c.features.list.push({
                  id: `feat_${c.features.list.length}_${Date.now().toString(36)}`,
                  name: "New Feature",
                  category: "class_feature",
                  automation: [],
                }),
              )
            }
          >
            <Plus className="size-4" /> Add feature
          </Button>
        </div>
        {features.length === 0 && (
          <p className="text-sm text-muted-foreground">No racial traits or class features yet.</p>
        )}
        <div className="space-y-2">
          {features.map((f, i) => (
            <div key={f.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <TextField
                label="Name"
                value={f.name}
                onChange={(v) =>
                  ed.update((c) => {
                    const t = c.features.list[i];
                    if (t) t.name = v;
                  })
                }
                className="flex-1"
              />
              <div className="w-44 space-y-1">
                <span className="block text-sm font-medium leading-none text-foreground">Category</span>
                <select
                  value={f.category}
                  aria-label="Feature category"
                  onChange={(e) =>
                    ed.update((c) => {
                      const t = c.features.list[i];
                      if (t) t.category = e.target.value as (typeof FEATURE_CATEGORIES)[number];
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                >
                  {FEATURE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove feature"
                onClick={() => ed.update((c) => c.features.list.splice(i, 1))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfileEditor({ ed }: { ed: EditorApi }) {
  const p = ed.draft.profile;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Portrait URL" value={p.portraitUrl ?? ""} onChange={(v) => ed.update((c) => (c.profile.portraitUrl = v || undefined))} />
        <TextField label="Token URL" value={p.tokenUrl ?? ""} onChange={(v) => ed.update((c) => (c.profile.tokenUrl = v || undefined))} />
      </div>
      <TextField label="Quote" value={p.quote ?? ""} onChange={(v) => ed.update((c) => (c.profile.quote = v || undefined))} />
      <TextAreaField
        label="Appearance"
        value={p.appearance.description ?? ""}
        rows={3}
        onChange={(v) => ed.update((c) => (c.profile.appearance.description = v || undefined))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextAreaField label="Personality" value={p.personality.description ?? ""} rows={3} onChange={(v) => ed.update((c) => (c.profile.personality.description = v || undefined))} />
        <TextAreaField label="Ideals & flaws" value={p.personality.ideals ?? ""} rows={3} onChange={(v) => ed.update((c) => (c.profile.personality.ideals = v || undefined))} />
      </div>
      <TextAreaField label="Backstory" value={p.backstory ?? ""} rows={6} onChange={(v) => ed.update((c) => (c.profile.backstory = v || undefined))} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Allies" value={p.allies ?? ""} onChange={(v) => ed.update((c) => (c.profile.allies = v || undefined))} />
        <TextField label="Foes" value={p.foes ?? ""} onChange={(v) => ed.update((c) => (c.profile.foes = v || undefined))} />
        <TextField label="Affiliations" value={p.affiliations ?? ""} onChange={(v) => ed.update((c) => (c.profile.affiliations = v || undefined))} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Live preview + status                                                      */
/* -------------------------------------------------------------------------- */

function LivePreview({
  ed,
  characterId,
  advanced,
}: {
  ed: EditorApi;
  characterId: string;
  advanced: boolean;
}) {
  const [showMath, setShowMath] = useState(false);
  const s = ed.computed.summary;
  const cells: Array<{ label: string; value: string | number }> = [
    { label: "AC", value: s.ac },
    { label: "Touch", value: s.touch },
    { label: "Flat", value: s.flatFooted },
    { label: "CMD", value: s.cmd },
    { label: "HP", value: `${s.hp.current}/${s.hp.max}` },
    { label: "Init", value: formatModifier(s.initiative) },
    { label: "Speed", value: `${s.speed.total} ft` },
    { label: "Fort", value: formatModifier(s.fortitude) },
    { label: "Reflex", value: formatModifier(s.reflex) },
    { label: "Will", value: formatModifier(s.will) },
  ];
  const breakdowns: Array<{ label: string; cv: ComputedValue }> = [
    { label: "Armor Class", cv: ed.computed.armorClass.total },
    { label: "Touch AC", cv: ed.computed.armorClass.touch },
    { label: "CMD", cv: ed.computed.armorClass.cmd },
    { label: "Fortitude", cv: ed.computed.saves.fortitude },
    { label: "Reflex", cv: ed.computed.saves.reflex },
    { label: "Will", cv: ed.computed.saves.will },
    { label: "Initiative", cv: ed.computed.initiative },
  ];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Live values
          </h2>
          <Link
            href={`/characters/${characterId}`}
            className="inline-flex items-center gap-1 text-xs text-rune hover:underline"
          >
            Overview <ExternalLink className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cells.map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-surface-raised p-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {c.label}
              </div>
              <div className="tnum text-base font-semibold text-foreground">{c.value}</div>
            </div>
          ))}
        </div>

        {advanced && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={() => setShowMath((v) => !v)}
            >
              <Sigma className="size-4" /> {showMath ? "Hide math" : "Show math"}
            </Button>
            {showMath && (
              <div className="mt-2 space-y-2">
                {breakdowns.map((b) => (
                  <FormulaBreakdown key={b.label} label={b.label} cv={b.cv} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormulaBreakdown({ label, cv }: { label: string; cv: ComputedValue }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="tnum text-sm font-semibold text-gold">{cv.value}</span>
      </div>
      <code className="mt-1 block break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
        {cv.formula}
      </code>
      {cv.terms.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {cv.terms.map((t, i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="truncate font-mono text-muted-foreground">{`@{${t.ref}}`}</span>
              <span className="tnum ml-2 shrink-0 text-foreground">{t.value}</span>
            </li>
          ))}
        </ul>
      )}
      {cv.warnings.length > 0 && (
        <p className="mt-2 text-[11px] text-warning">{cv.warnings.join("; ")}</p>
      )}
      {cv.errors.length > 0 && <p className="mt-2 text-[11px] text-danger">{cv.errors.join("; ")}</p>}
    </div>
  );
}

const STATUS_META: Record<SaveStatus, { label: string; icon: typeof Check; className: string }> = {
  saved: { label: "Saved", icon: Check, className: "text-success" },
  unsaved: { label: "Unsaved", icon: Cloud, className: "text-muted-foreground" },
  saving: { label: "Saving…", icon: Loader2, className: "text-rune" },
  error: { label: "Save failed", icon: CircleAlert, className: "text-danger" },
};

function SaveStatusBadge({ status, error }: { status: SaveStatus; error: string | null }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.className)}
      title={error ?? undefined}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("size-3.5", status === "saving" && "animate-spin")} />
      {meta.label}
    </span>
  );
}
