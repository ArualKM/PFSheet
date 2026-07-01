"use client";

import { Plus, Trash2 } from "lucide-react";
import { BONUS_TYPES, type BonusType, type ModifierEntry } from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { NumberField, TextField } from "./fields";
import { cn } from "@/lib/utils";

function newModifierId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Reusable editor for a list of `ModifierEntry`s entered directly on a stat (save misc, AC
 * modifiers, skill misc, …). Each row is label · value (number or ƒx formula) · bonus type ·
 * enabled — the direct-modifier sibling of `AutomationEffectsEditor` (which edits
 * `AutomationEffect`s on feats/items). A formula value can reference `@{…}` paths and the
 * `[[…]]` inline-roll brackets, so "[[@{level}*2]]" scales with the sheet.
 */
export function ModifierListEditor({
  entries,
  onChange,
  title = "Modifiers",
  idPrefix = "mod",
  addLabel = "Add modifier",
  emptyHint,
  defaultLabel = "",
}: {
  entries: ModifierEntry[];
  onChange: (next: ModifierEntry[]) => void;
  title?: string;
  idPrefix?: string;
  addLabel?: string;
  emptyHint?: string;
  defaultLabel?: string;
}) {
  const update = (i: number, patch: Partial<ModifierEntry>) =>
    onChange(entries.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...entries,
      { id: newModifierId(idPrefix), label: defaultLabel, value: 1, bonusType: "untyped", enabled: true },
    ]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {entries.length > 0 ? ` (${entries.length})` : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={add}>
          <Plus className="size-4" /> {addLabel}
        </Button>
      </div>

      {entries.length === 0 && emptyHint && <p className="text-[11px] text-muted-foreground">{emptyHint}</p>}

      {entries.map((m, i) => {
        const isFormula = typeof m.value === "string";
        const disabled = m.enabled === false;
        return (
          <div
            key={m.id}
            className={cn(
              "flex flex-wrap items-end gap-2 rounded-lg border border-border p-2",
              disabled && "opacity-60",
            )}
          >
            <TextField
              label="Label"
              value={m.label}
              onChange={(v) => update(i, { label: v })}
              placeholder="Cloak of resistance"
              className="min-w-[8rem] flex-1"
            />

            {isFormula ? (
              <TextField
                label="Value (formula)"
                value={String(m.value)}
                onChange={(v) => update(i, { value: v })}
                placeholder="[[@{level.total}/2]]"
                className="min-w-[10rem] flex-1 font-mono"
              />
            ) : (
              <NumberField
                label="Value"
                value={typeof m.value === "number" ? m.value : 0}
                onChange={(v) => update(i, { value: v })}
                className="w-20"
              />
            )}

            <button
              type="button"
              aria-pressed={isFormula}
              aria-label="Toggle formula value"
              title="Use a formula value — reference @{level.total}, @{abilities.str.mod}, [[…]] inline rolls, …"
              onClick={() => update(i, { value: isFormula ? 0 : "@{level.total}" })}
              className={cn(
                "h-11 shrink-0 rounded-md border px-2 text-xs font-medium transition-colors sm:h-9",
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
                value={m.bonusType ?? "untyped"}
                aria-label="Modifier bonus type"
                onChange={(ev) => update(i, { bonusType: ev.target.value as BonusType })}
                className="h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground sm:h-9"
              >
                {BONUS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex h-11 items-center gap-1.5 text-xs text-muted-foreground sm:h-9">
              <input
                type="checkbox"
                checked={m.enabled !== false}
                onChange={(ev) => update(i, { enabled: ev.target.checked })}
                aria-label={`${m.label || "modifier"} enabled`}
                className="size-4 accent-[var(--pf-gold)]"
              />
              On
            </label>

            <Button variant="ghost" size="icon" aria-label="Remove modifier" onClick={() => remove(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
