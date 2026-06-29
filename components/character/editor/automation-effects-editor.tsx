"use client";

import { Plus, Trash2 } from "lucide-react";
import { BONUS_TYPES, type AutomationEffect, type AutomationOperation, type BonusType } from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { NumberField, TextField } from "./fields";
import { cn } from "@/lib/utils";

/**
 * Targets the engine's `classifyTarget()` actually honors. Anything outside this set is silently
 * dropped by the modifier index, so the dropdown only offers values that compute. Keep in sync with
 * `packages/pathforge-rules-pf1e/src/compute.ts` `classifyTarget()`.
 */
export const AUTOMATION_TARGET_OPTIONS: { label: string; target: string }[] = [
  { label: "AC", target: "defenses.armorClass" },
  { label: "Attack (all)", target: "attack" },
  { label: "Melee attack", target: "attack.melee" },
  { label: "Ranged attack", target: "attack.ranged" },
  { label: "CMB", target: "attack.cmb" },
  { label: "CMD", target: "cmd" },
  { label: "Fortitude", target: "saves.fortitude" },
  { label: "Reflex", target: "saves.reflex" },
  { label: "Will", target: "saves.will" },
  { label: "All saves", target: "save.all" },
  { label: "Initiative", target: "combat.initiative" },
  { label: "Speed", target: "speed" },
  { label: "All skills", target: "skill.all" },
  { label: "Max HP", target: "hp" },
  { label: "Strength", target: "abilities.str" },
  { label: "Dexterity", target: "abilities.dex" },
  { label: "Constitution", target: "abilities.con" },
  { label: "Intelligence", target: "abilities.int" },
  { label: "Wisdom", target: "abilities.wis" },
  { label: "Charisma", target: "abilities.cha" },
];

const CUSTOM_TARGET = "__custom__";

/**
 * Seed used when a row's value is toggled to ƒx (formula) mode. One shared, always-resolvable path so
 * the Buff Center custom form and the feat/feature/trait editor start from the same formula instead of
 * drifting (they previously seeded different paths). @{combat.bab.total}, @{abilities.str.mod}, … are
 * equally valid — this is just the editable starting point.
 */
const FORMULA_SEED = "@{level.total}";

/**
 * The id-agnostic slice of an effect a row *writes*. The Buff Center's pre-submit draft uses this as
 * its state shape, and it is the patch type a row emits — operations are narrowed to add/subtract (the
 * only ones the passive modifier engine `effectToMod` honors) and value to number|string (the ƒx
 * toggle only ever produces those). `Partial<EditableEffect>` is assignable to `Partial<AutomationEffect>`,
 * so a persisted-effect editor can take a row's patch directly.
 */
export type EditableEffect = {
  target: string;
  operation: "add" | "subtract";
  value: number | string;
  bonusType: BonusType;
};

/**
 * The wider shape a row *reads*. Both `AutomationEffect` (persisted — wider `operation`/`value`, a
 * `boolean` value, optional `bonusType`) and `EditableEffect` (the draft) structurally satisfy it, so
 * the one row renders either. Reads tolerate the extra cases (any non-add operation shows as "+", a
 * boolean value falls through to the number field).
 */
type EffectRowValue = {
  target: string;
  operation: AutomationOperation;
  value: number | string | boolean;
  bonusType?: BonusType;
};

function newEffectId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * One effect row: target select (+ Custom… freeform) · operation · value (number or ƒx formula) ·
 * bonus type · remove. Id-agnostic and controlled — the caller owns the list shape, the React key, and
 * how a patch is applied; the row only reads/patches the four editable fields. Shared by
 * `AutomationEffectsEditor` and the Buff Center custom-buff form so their target menus can't drift.
 */
export function EffectRow({
  effect,
  onChange,
  onRemove,
  hiddenTargets = [],
}: {
  effect: EffectRowValue;
  onChange: (patch: Partial<EditableEffect>) => void;
  onRemove: () => void;
  /**
   * Targets to omit from THIS row's dropdown (e.g. `attack*` on a weapon item, which would
   * double-count the weapon's own Enhancement field). The effect's own saved target stays selectable
   * so editing never silently rewrites it, and the Custom field still accepts it — a guard-rail, not
   * a hard block. Mirrors the inventory `targetOptions()` carve-out.
   */
  hiddenTargets?: string[];
}) {
  const isFormula = typeof effect.value === "string";
  const known = AUTOMATION_TARGET_OPTIONS.some((o) => o.target === effect.target);
  const rowOptions = AUTOMATION_TARGET_OPTIONS.filter(
    (o) => !hiddenTargets.includes(o.target) || o.target === effect.target,
  );
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
      <div className="space-y-1">
        <span className="block text-[11px] text-muted-foreground">Target</span>
        <select
          value={known ? effect.target : CUSTOM_TARGET}
          aria-label="Effect target"
          onChange={(ev) => onChange({ target: ev.target.value === CUSTOM_TARGET ? "" : ev.target.value })}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          {rowOptions.map((o) => (
            <option key={o.target} value={o.target}>
              {o.label}
            </option>
          ))}
          <option value={CUSTOM_TARGET}>Custom…</option>
        </select>
      </div>

      {!known && (
        <TextField
          label="Custom target"
          value={effect.target}
          onChange={(v) => onChange({ target: v })}
          placeholder="skills.perception"
          className="w-40 font-mono"
        />
      )}

      <div className="space-y-1">
        <span className="block text-[11px] text-muted-foreground">Op</span>
        <select
          value={effect.operation === "subtract" ? "subtract" : "add"}
          aria-label="Effect operation"
          onChange={(ev) => onChange({ operation: ev.target.value as "add" | "subtract" })}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="add">+</option>
          <option value="subtract">−</option>
        </select>
      </div>

      {isFormula ? (
        <TextField
          label="Value (formula)"
          value={String(effect.value)}
          onChange={(v) => onChange({ value: v })}
          placeholder="floor(@{level.total}/2)"
          className="min-w-[12rem] flex-1 font-mono"
        />
      ) : (
        <NumberField
          label="Value"
          value={typeof effect.value === "number" ? effect.value : 0}
          onChange={(v) => onChange({ value: v })}
          className="w-20"
        />
      )}

      <button
        type="button"
        aria-pressed={isFormula}
        aria-label="Toggle formula value"
        title="Use a formula value — reference @{combat.bab.total}, @{level.total}, @{abilities.str.mod}, …"
        onClick={() => onChange({ value: isFormula ? 0 : FORMULA_SEED })}
        className={cn(
          "h-9 shrink-0 rounded-md border px-2 text-xs font-medium transition-colors",
          isFormula
            ? "border-gold/40 bg-gold/10 text-gold"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        ƒx
      </button>

      <div className="space-y-1">
        <span className="block text-[11px] text-muted-foreground">Bonus type</span>
        <select
          value={effect.bonusType ?? "untyped"}
          aria-label="Effect bonus type"
          onChange={(ev) => onChange({ bonusType: ev.target.value as BonusType })}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          {BONUS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <Button variant="ghost" size="icon" aria-label="Remove effect" onClick={onRemove}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Reusable editor for a list of `AutomationEffect`s (feats / features / traits / items). Each row is
 * target · operation · value (number or ƒx formula) · bonus type — the same shape the Buff Center's
 * custom-effect form uses. Only `add`/`subtract` are offered because the engine's `effectToMod()`
 * ignores other operations for passive modifiers; a formula value (ƒx) can reference `@{…}` paths so
 * an effect can scale off level/BAB.
 */
export function AutomationEffectsEditor({
  effects,
  onChange,
  idPrefix = "fx",
  hiddenTargets = [],
  defaultTarget = "attack",
}: {
  effects: AutomationEffect[];
  onChange: (next: AutomationEffect[]) => void;
  idPrefix?: string;
  /**
   * Targets to omit from the dropdown for this call site (e.g. `attack*` on a weapon item, which
   * would double-count the weapon's own Enhancement field). A target already saved on an effect
   * stays selectable so editing never silently rewrites it — and the Custom field still accepts
   * the hidden target, so this is a guard-rail, not a hard block (mirrors the inventory
   * `targetOptions()` carve-out).
   */
  hiddenTargets?: string[];
  /**
   * Target a freshly-added effect starts on. Defaults to `attack` (feats/features/traits). Item
   * call sites pass a defensive default so a new effect never starts on a `hiddenTargets` value.
   */
  defaultTarget?: string;
}) {
  const update = (i: number, patch: Partial<AutomationEffect>) =>
    onChange(effects.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(effects.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...effects,
      { id: newEffectId(idPrefix), target: defaultTarget, operation: "add", value: 1, bonusType: "untyped" },
    ]);

  return (
    <div className="space-y-2 border-t border-border/40 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Effects{effects.length > 0 ? ` (${effects.length})` : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={add}>
          <Plus className="size-4" /> Add effect
        </Button>
      </div>

      {effects.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No automated effects. Add one to make this a computed bonus (e.g. Attack +1, Will +2, Max HP +3).
        </p>
      )}

      {effects.map((e, i) => (
        <EffectRow
          key={e.id}
          effect={e}
          hiddenTargets={hiddenTargets}
          onChange={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
        />
      ))}
    </div>
  );
}
