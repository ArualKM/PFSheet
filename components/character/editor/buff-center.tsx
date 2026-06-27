"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  BookmarkPlus,
  TriangleAlert,
  ChevronRight,
  Timer,
  Swords,
  Moon,
  PowerOff,
} from "lucide-react";
import {
  BUFF_LIBRARY,
  BONUS_TYPES,
  type ActiveBuff,
  type AutomationEffect,
  type BonusType,
  type BuffCategory,
  type BuffTemplate,
  type DurationUnit,
} from "@pathforge/schema";
import { detectStackingConflicts, activeBuffDelta, previewBuffEffects, type BuffDeltaRow } from "@pathforge/rules-pf1e";
import { NumberField, TextField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DURATION_UNITS: DurationUnit[] = [
  "rounds",
  "minutes",
  "hours",
  "days",
  "session",
  "rest",
  "permanent",
  "concentration",
  "custom",
];

const TARGET_OPTIONS: { label: string; target: string }[] = [
  { label: "AC", target: "defenses.armorClass" },
  { label: "Attack", target: "attack" },
  { label: "Fortitude", target: "saves.fortitude" },
  { label: "Reflex", target: "saves.reflex" },
  { label: "Will", target: "saves.will" },
  { label: "Initiative", target: "combat.initiative" },
  { label: "Speed", target: "speed" },
  { label: "CMD", target: "cmd" },
  { label: "Strength", target: "abilities.str" },
  { label: "Dexterity", target: "abilities.dex" },
  { label: "Constitution", target: "abilities.con" },
  { label: "Intelligence", target: "abilities.int" },
  { label: "Wisdom", target: "abilities.wis" },
  { label: "Charisma", target: "abilities.cha" },
];

const TARGET_LABEL: Record<string, string> = {
  "defenses.armorclass": "AC",
  ac: "AC",
  "saves.fortitude": "Fort",
  "saves.reflex": "Reflex",
  "saves.will": "Will",
  "combat.initiative": "Init",
  initiative: "Init",
  speed: "Speed",
  attack: "Attack",
  cmd: "CMD",
  "abilities.str": "STR",
  "abilities.dex": "DEX",
  "abilities.con": "CON",
  "abilities.int": "INT",
  "abilities.wis": "WIS",
  "abilities.cha": "CHA",
};

const CATEGORY_LABEL: Record<BuffCategory, string> = {
  spell: "Spell",
  class_feature: "Class",
  condition: "Condition",
  item: "Item",
  custom: "Custom",
};

function targetLabel(target: string): string {
  return TARGET_LABEL[target.toLowerCase()] ?? target;
}

function describeEffect(e: AutomationEffect): string {
  if (typeof e.value === "boolean") return targetLabel(e.target);
  const sign = e.operation === "subtract" ? "−" : "+";
  const type = e.bonusType && e.bonusType !== "untyped" ? ` ${e.bonusType}` : "";
  return `${targetLabel(e.target)} ${sign}${e.value}${type}`;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function activeFromTemplate(t: BuffTemplate, level: number): ActiveBuff {
  return {
    id: newId("buff"),
    templateId: t.id,
    name: t.name,
    enabled: true,
    category: t.category,
    source: t.source,
    duration: t.defaultDuration,
    // Seed a usable round counter (most rounds-based buffs scale with level) so
    // the countdown works immediately; the field stays user-editable.
    remainingRounds:
      t.defaultDuration?.unit === "rounds"
        ? (t.defaultDuration.amount ?? Math.max(1, level))
        : undefined,
    effects: t.effects.map((e) => ({ ...e, id: newId("fx") })),
    notes: t.description,
  };
}

/* -------------------------------------------------------------------------- */

export function BuffCenter({ ed }: { ed: CharacterEditorApi }) {
  const active = ed.draft.buffs.active;
  // Memoized on the draft so toggling local UI state (library/custom panels)
  // doesn't re-run the conflict scan or per-buff recomputes.
  const conflicts = useMemo(() => detectStackingConflicts(ed.draft), [ed.draft]);
  const deltas = useMemo(() => {
    const map = new Map<string, BuffDeltaRow[]>();
    for (const b of ed.draft.buffs.active) map.set(b.id, activeBuffDelta(ed.draft, b.id));
    return map;
  }, [ed.draft]);
  const [showLibrary, setShowLibrary] = useState(active.length === 0);
  const [showCustom, setShowCustom] = useState(false);

  const addBuff = (t: BuffTemplate) =>
    ed.update((c) => c.buffs.active.push(activeFromTemplate(t, c.identity.totalLevel)));
  const toggle = (id: string) =>
    ed.update((c) => {
      const b = c.buffs.active.find((x) => x.id === id);
      if (!b) return;
      b.enabled = !b.enabled;
      // Re-enabling a rounds buff with a spent/empty counter starts a fresh duration.
      if (b.enabled && b.duration?.unit === "rounds" && !b.remainingRounds) {
        b.remainingRounds = b.duration.amount ?? Math.max(1, c.identity.totalLevel);
      }
    });
  const remove = (id: string) =>
    ed.update((c) => {
      c.buffs.active = c.buffs.active.filter((x) => x.id !== id);
    });
  const duplicate = (id: string) =>
    ed.update((c) => {
      const b = c.buffs.active.find((x) => x.id === id);
      if (b) c.buffs.active.push({ ...structuredClone(b), id: newId("buff"), name: `${b.name} (copy)` });
    });
  const saveTemplate = (b: ActiveBuff) =>
    ed.update((c) => {
      c.buffs.templates.push({
        id: newId("tpl"),
        name: b.name,
        category: b.category ?? "custom",
        description: b.notes,
        defaultDuration: b.duration,
        effects: b.effects.map((e) => ({ ...e })),
        tags: ["custom"],
      });
    });
  const setRemaining = (id: string, rounds: number) =>
    ed.update((c) => {
      const b = c.buffs.active.find((x) => x.id === id);
      if (b) b.remainingRounds = rounds;
    });

  // Bulk actions
  const advanceRound = () =>
    ed.update((c) => {
      for (const b of c.buffs.active) {
        if (!b.enabled || typeof b.remainingRounds !== "number") continue;
        b.remainingRounds = Math.max(0, b.remainingRounds - 1);
        if (b.remainingRounds === 0) {
          b.enabled = false;
          b.remainingRounds = undefined; // no stale 0 counter on a disabled buff
        }
      }
    });
  const endEncounter = () =>
    ed.update((c) => {
      for (const b of c.buffs.active) {
        if (b.duration && (b.duration.unit === "rounds" || b.duration.unit === "minutes")) b.enabled = false;
      }
    });
  const rest = () =>
    ed.update((c) => {
      for (const b of c.buffs.active) {
        if (!b.duration || b.duration.unit !== "permanent") b.enabled = false;
      }
    });
  const deactivateAll = () =>
    ed.update((c) => {
      for (const b of c.buffs.active) b.enabled = false;
    });

  // Each bulk action is gated by what it will actually change, so a disabled
  // button never hides a no-op (and an enabled one always does something).
  const canAdvanceRound = active.some((b) => b.enabled && typeof b.remainingRounds === "number");
  const canEndEncounter = active.some(
    (b) => b.enabled && b.duration && (b.duration.unit === "rounds" || b.duration.unit === "minutes"),
  );
  const canRest = active.some((b) => b.enabled && (!b.duration || b.duration.unit !== "permanent"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Buff Center</h3>
          <p className="text-xs text-muted-foreground">
            Toggle effects, track durations, and preview how they change your stats. Active buffs feed
            every calculation live.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={advanceRound} disabled={!canAdvanceRound} title="Advance one round">
            <Timer className="size-4" /> Advance round
          </Button>
          <Button size="sm" variant="ghost" onClick={endEncounter} disabled={!canEndEncounter} title="Expire short-term buffs">
            <Swords className="size-4" /> End encounter
          </Button>
          <Button size="sm" variant="ghost" onClick={rest} disabled={!canRest} title="Expire all non-permanent buffs">
            <Moon className="size-4" /> Rest
          </Button>
          <Button size="sm" variant="ghost" onClick={deactivateAll} disabled={!active.some((b) => b.enabled)} title="Deactivate all buffs">
            <PowerOff className="size-4" /> All off
          </Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <TriangleAlert className="size-4" /> Stacking conflicts
          </div>
          <ul className="space-y-1 text-xs text-foreground/90">
            {conflicts.map((conflict, i) => (
              <li key={i}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="space-y-2">
        {active.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No active buffs. Add Haste, Bless, Rage, or a custom effect from the library below before
            initiative gets messy.
          </p>
        )}
        {active.map((b) => (
          <ActiveBuffCard
            key={b.id}
            buff={b}
            delta={deltas.get(b.id) ?? []}
            onToggle={() => toggle(b.id)}
            onRemove={() => remove(b.id)}
            onDuplicate={() => duplicate(b.id)}
            onSaveTemplate={() => saveTemplate(b)}
            onSetRemaining={(r) => setRemaining(b.id, r)}
          />
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setShowLibrary((v) => !v)}>
          <ChevronRight className={cn("size-4 transition-transform", showLibrary && "rotate-90")} /> Buff library
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowCustom((v) => !v)}>
          <Plus className="size-4" /> Create custom buff
        </Button>
      </div>

      {showCustom && <CustomBuffForm ed={ed} onAdd={(b) => ed.update((c) => c.buffs.active.push(b))} onClose={() => setShowCustom(false)} />}

      {showLibrary && (
        <section className="grid gap-2 sm:grid-cols-2">
          {BUFF_LIBRARY.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{t.name}</span>
                    <Badge variant="rune">{CATEGORY_LABEL[t.category]}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Add ${t.name}`} onClick={() => addBuff(t)}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {t.effects.map((e) => (
                  <span key={e.id} className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {describeEffect(e)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ActiveBuffCard({
  buff,
  delta,
  onToggle,
  onRemove,
  onDuplicate,
  onSaveTemplate,
  onSetRemaining,
}: {
  buff: ActiveBuff;
  delta: { label: string; delta: number }[];
  onToggle: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onSaveTemplate: () => void;
  onSetRemaining: (rounds: number) => void;
}) {
  const isRounds = buff.duration?.unit === "rounds";
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        buff.enabled ? "border-gold/40 bg-gold/5" : "border-border bg-surface opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={buff.enabled}
            aria-label={`Toggle ${buff.name}`}
            onClick={onToggle}
            className={cn(
              "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
              buff.enabled ? "bg-gold" : "bg-border",
            )}
          >
            <span
              className={cn(
                "size-4 rounded-full bg-background transition-transform",
                buff.enabled && "translate-x-4",
              )}
            />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{buff.name}</span>
              {buff.category && <Badge variant="rune">{CATEGORY_LABEL[buff.category]}</Badge>}
              {buff.duration && (
                <span className="text-[11px] text-muted-foreground">
                  {buff.duration.unit}
                  {buff.duration.note ? ` · ${buff.duration.note}` : ""}
                </span>
              )}
            </div>
            {buff.enabled && delta.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {delta.map((d) => (
                  <span key={d.label} className="tnum rounded bg-surface-raised px-1.5 py-0.5 text-[11px] text-foreground">
                    {d.label} {d.delta >= 0 ? "+" : ""}
                    {d.delta}
                  </span>
                ))}
              </div>
            )}
            {buff.enabled && delta.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                No net change (suppressed by stacking or already applied).
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isRounds && (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Timer className="size-3.5" />
              <input
                type="number"
                min={0}
                aria-label={`${buff.name} remaining rounds`}
                value={buff.remainingRounds ?? ""}
                onChange={(e) => onSetRemaining(e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)))}
                className="tnum h-11 w-12 rounded-md border border-border bg-background px-1.5 text-center text-xs md:h-10"
              />
            </label>
          )}
          <Button variant="ghost" size="icon" aria-label="Duplicate buff" onClick={onDuplicate} title="Duplicate">
            <Copy className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Save as template" onClick={onSaveTemplate} title="Save as template">
            <BookmarkPlus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Remove buff" onClick={onRemove} title="Remove">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type DraftEffect = { target: string; operation: "add" | "subtract"; value: number | string; bonusType: BonusType };

function CustomBuffForm({
  ed,
  onAdd,
  onClose,
}: {
  ed: CharacterEditorApi;
  onAdd: (b: ActiveBuff) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BuffCategory>("custom");
  const [unit, setUnit] = useState<DurationUnit>("rounds");
  const [amount, setAmount] = useState(0);
  const [effects, setEffects] = useState<DraftEffect[]>([
    { target: "defenses.armorClass", operation: "add", value: 1, bonusType: "untyped" },
  ]);

  const updateEffect = (i: number, patch: Partial<DraftEffect>) =>
    setEffects((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  // Live preview of what the effects resolve to (evaluates any formula values).
  const preview = useMemo(
    () =>
      previewBuffEffects(
        ed.draft,
        effects.map((e, i) => ({
          id: `p${i}`,
          target: e.target,
          operation: e.operation,
          value: e.value,
          bonusType: e.bonusType,
        })),
      ),
    [ed.draft, effects],
  );

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const buff: ActiveBuff = {
      id: newId("buff"),
      name: trimmed,
      category,
      enabled: true,
      duration: { unit, amount: amount || undefined },
      remainingRounds: unit === "rounds" && amount ? amount : undefined,
      effects: effects.map((e) => ({ id: newId("fx"), ...e })),
    };
    onAdd(buff);
    onClose();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" value={name} onChange={setName} placeholder="Moonlit Oath" />
        <div className="space-y-1">
          <span className="block text-sm font-medium leading-none text-foreground">Category</span>
          <select
            value={category}
            aria-label="Buff category"
            onChange={(e) => setCategory(e.target.value as BuffCategory)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            {(Object.keys(CATEGORY_LABEL) as BuffCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <span className="block text-sm font-medium leading-none text-foreground">Duration</span>
          <select
            value={unit}
            aria-label="Duration unit"
            onChange={(e) => setUnit(e.target.value as DurationUnit)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            {DURATION_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <NumberField label="Amount" value={amount} min={0} onChange={setAmount} hint="e.g. rounds remaining" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Effects</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setEffects((prev) => [...prev, { target: "attack", operation: "add", value: 1, bonusType: "untyped" }])
            }
          >
            <Plus className="size-4" /> Add effect
          </Button>
        </div>
        {effects.map((e, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
            <div className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">Target</span>
              <select
                value={e.target}
                aria-label="Effect target"
                onChange={(ev) => updateEffect(i, { target: ev.target.value })}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {TARGET_OPTIONS.map((o) => (
                  <option key={o.target} value={o.target}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">Op</span>
              <select
                value={e.operation}
                aria-label="Effect operation"
                onChange={(ev) => updateEffect(i, { operation: ev.target.value as "add" | "subtract" })}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="add">+</option>
                <option value="subtract">−</option>
              </select>
            </div>
            {typeof e.value === "string" ? (
              <TextField
                label="Value (formula)"
                value={e.value}
                onChange={(v) => updateEffect(i, { value: v })}
                placeholder="floor(@{combat.bab.total} / 4)"
                className="min-w-[12rem] flex-1 font-mono"
              />
            ) : (
              <NumberField label="Value" value={e.value} onChange={(v) => updateEffect(i, { value: v })} className="w-20" />
            )}
            <button
              type="button"
              aria-pressed={typeof e.value === "string"}
              aria-label="Toggle formula value"
              title="Use a formula value — reference @{combat.bab.total}, @{level.total}, @{abilities.str.mod}, …"
              onClick={() => updateEffect(i, { value: typeof e.value === "string" ? 0 : "@{combat.bab.total}" })}
              className={cn(
                "h-9 shrink-0 rounded-md border px-2 text-xs font-medium transition-colors",
                typeof e.value === "string"
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              ƒx
            </button>
            <div className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">Bonus type</span>
              <select
                value={e.bonusType}
                aria-label="Effect bonus type"
                onChange={(ev) => updateEffect(i, { bonusType: ev.target.value as BonusType })}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {BONUS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove effect"
              onClick={() => setEffects((prev) => prev.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      {preview.length > 0 && (
        <div>
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Resolved effect</span>
          <div className="flex flex-wrap gap-1">
            {preview.map((d) => (
              <span key={d.label} className="tnum rounded bg-surface px-1.5 py-0.5 text-[11px] text-foreground">
                {d.label} {d.delta >= 0 ? "+" : ""}
                {d.delta}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!name.trim()}>
          Add buff
        </Button>
      </div>
    </div>
  );
}
