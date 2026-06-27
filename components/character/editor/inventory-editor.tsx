"use client";

import { Plus, Trash2, Coins, Backpack } from "lucide-react";
import type { EquipmentItem } from "@pathforge/schema";
import { BONUS_TYPES } from "@pathforge/schema";
import { NumberField, TextField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";

/** Common single-stat targets a magic-item bonus can hit (each routes in the rules engine). */
const ITEM_TARGETS = [
  { value: "ac", label: "AC" },
  { value: "fortitude", label: "Fort save" },
  { value: "reflex", label: "Ref save" },
  { value: "will", label: "Will save" },
  { value: "initiative", label: "Initiative" },
  { value: "attack.melee", label: "Melee atk" },
  { value: "attack.ranged", label: "Ranged atk" },
  { value: "abilities.str", label: "STR" },
  { value: "abilities.dex", label: "DEX" },
  { value: "abilities.con", label: "CON" },
  { value: "abilities.int", label: "INT" },
  { value: "abilities.wis", label: "WIS" },
  { value: "abilities.cha", label: "CHA" },
];

type ItemArrayKey = "weapons" | "armorAndShields" | "potionsScrollsMagicItems" | "gear" | "otherItems";

const ITEM_ARRAYS: ItemArrayKey[] = [
  "weapons",
  "armorAndShields",
  "potionsScrollsMagicItems",
  "gear",
  "otherItems",
];

const CATEGORIES: EquipmentItem["category"][] = [
  "weapon",
  "armor",
  "shield",
  "potion",
  "scroll",
  "wand",
  "magic_item",
  "gear",
  "other",
];

const CATEGORY_ARRAY: Record<EquipmentItem["category"], ItemArrayKey> = {
  weapon: "weapons",
  armor: "armorAndShields",
  shield: "armorAndShields",
  potion: "potionsScrollsMagicItems",
  scroll: "potionsScrollsMagicItems",
  wand: "potionsScrollsMagicItems",
  magic_item: "potionsScrollsMagicItems",
  gear: "gear",
  other: "otherItems",
};

const COIN: { key: "pp" | "gp" | "sp" | "cp"; label: string }[] = [
  { key: "pp", label: "Platinum" },
  { key: "gp", label: "Gold" },
  { key: "sp", label: "Silver" },
  { key: "cp", label: "Copper" },
];

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function InventoryEditor({ ed }: { ed: CharacterEditorApi }) {
  const inv = ed.draft.inventory;
  const wealth = ed.draft.wealth;
  const items = ITEM_ARRAYS.flatMap((arr) => inv[arr].map((item) => item));
  const totalGp = wealth.pp * 10 + wealth.gp + wealth.sp / 10 + wealth.cp / 100;
  const carriedWeight = items.reduce((s, item) => s + (item.weight ?? 0) * (item.quantity ?? 1), 0);

  const addItem = () =>
    ed.update((c) =>
      c.inventory.gear.push({
        id: newId("item"),
        name: "New item",
        category: "gear",
        quantity: 1,
        equipped: false,
        automation: [],
        modifiers: [],
        identified: true,
      }),
    );

  const updateItem = (id: string, patch: Partial<EquipmentItem>) =>
    ed.update((c) => {
      for (const arr of ITEM_ARRAYS) {
        const idx = c.inventory[arr].findIndex((x) => x.id === id);
        if (idx < 0) continue;
        const merged = { ...c.inventory[arr][idx]!, ...patch } as EquipmentItem;
        const target = CATEGORY_ARRAY[merged.category];
        if (target !== arr) {
          c.inventory[arr].splice(idx, 1);
          c.inventory[target].push(merged);
        } else {
          c.inventory[arr][idx] = merged;
        }
        return;
      }
    });

  const setModifiers = (item: EquipmentItem, modifiers: EquipmentItem["modifiers"]) =>
    updateItem(item.id, { modifiers });
  const addModifier = (item: EquipmentItem) =>
    setModifiers(item, [
      ...item.modifiers,
      { id: newId("mod"), label: item.name, value: 0, target: "ac", bonusType: "enhancement", enabled: true },
    ]);
  const updateModifier = (
    item: EquipmentItem,
    mi: number,
    patch: Partial<EquipmentItem["modifiers"][number]>,
  ) => setModifiers(item, item.modifiers.map((m, idx) => (idx === mi ? { ...m, ...patch } : m)));
  const removeModifier = (item: EquipmentItem, mi: number) =>
    setModifiers(item, item.modifiers.filter((_, idx) => idx !== mi));

  const removeItem = (id: string) =>
    ed.update((c) => {
      for (const arr of ITEM_ARRAYS) {
        const idx = c.inventory[arr].findIndex((x) => x.id === id);
        if (idx >= 0) {
          c.inventory[arr].splice(idx, 1);
          return;
        }
      }
    });

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Coins className="size-4 text-gold" /> Wealth
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COIN.map((c) => (
            <NumberField
              key={c.key}
              label={c.label}
              value={wealth[c.key]}
              min={0}
              onChange={(v) => ed.update((d) => (d.wealth[c.key] = v))}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Total: <span className="tnum font-semibold text-foreground">{totalGp.toLocaleString(undefined, { maximumFractionDigits: 2 })} gp</span>
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Backpack className="size-4" /> Items
            <span className="text-xs font-normal text-muted-foreground">
              · {items.length} item{items.length === 1 ? "" : "s"} · {carriedWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb
            </span>
          </h3>
          <Button size="sm" variant="secondary" onClick={addItem}>
            <Plus className="size-4" /> Add item
          </Button>
        </div>

        {items.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No items yet. Add weapons, armor, gear, and magic items here. Equipped items with bonuses
            feed your computed AC, saves, and attacks.
          </p>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <TextField
                  label="Name"
                  value={item.name}
                  onChange={(v) => updateItem(item.id, { name: v })}
                  className="min-w-[10rem] flex-1"
                />
                <div className="space-y-1">
                  <span className="block text-[11px] text-muted-foreground">Category</span>
                  <select
                    value={item.category}
                    aria-label={`${item.name} category`}
                    onChange={(e) => updateItem(item.id, { category: e.target.value as EquipmentItem["category"] })}
                    className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <NumberField
                  label="Qty"
                  value={item.quantity}
                  min={0}
                  onChange={(v) => updateItem(item.id, { quantity: v })}
                  className="w-20"
                />
                <NumberField
                  label="Wt (lb)"
                  value={item.weight ?? 0}
                  min={0}
                  integer={false}
                  onChange={(v) => updateItem(item.id, { weight: v })}
                  className="w-24"
                />
                <TextField
                  label="Cost"
                  value={item.cost ?? ""}
                  onChange={(v) => updateItem(item.id, { cost: v })}
                  placeholder="e.g. 15 gp"
                  className="w-28"
                />
                <label className="flex h-10 items-center gap-1.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={!!item.equipped}
                    aria-label={`${item.name} equipped`}
                    onChange={(e) => updateItem(item.id, { equipped: e.target.checked })}
                    className="size-4 accent-[var(--pf-gold)]"
                  />
                  Equipped
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {(item.category === "armor" || item.category === "shield") && (
                <div className="mt-2 grid grid-cols-3 gap-2 rounded-md border border-border/60 p-2">
                  <NumberField
                    label="AC bonus"
                    value={item.armorBonus ?? 0}
                    onChange={(v) => updateItem(item.id, { armorBonus: v || undefined })}
                  />
                  <NumberField
                    label="Max Dex"
                    value={item.maxDexBonus ?? 0}
                    onChange={(v) => updateItem(item.id, { maxDexBonus: v || undefined })}
                  />
                  <NumberField
                    label="ACP"
                    value={item.armorCheckPenalty ?? 0}
                    min={0}
                    onChange={(v) => updateItem(item.id, { armorCheckPenalty: v || undefined })}
                  />
                </div>
              )}

              <TextField
                label="Notes"
                value={item.notes ?? ""}
                onChange={(v) => updateItem(item.id, { notes: v })}
                placeholder="Properties, attunement, location…"
                className="mt-2"
              />

              <div className="mt-3 rounded-md border border-border/60 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Bonuses (apply when equipped)
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => addModifier(item)}>
                    <Plus className="size-3.5" /> Add
                  </Button>
                </div>
                {item.modifiers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    None. Add e.g. +2 resistance to Fort, or +1 deflection to AC.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {item.modifiers.map((m, mi) => (
                      <div key={m.id} className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="number"
                          value={typeof m.value === "number" ? m.value : 0}
                          aria-label={`${item.name} bonus value`}
                          onChange={(e) =>
                            updateModifier(item, mi, {
                              value: e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)),
                            })
                          }
                          className="tnum h-8 w-14 rounded border border-border bg-background px-2 text-sm"
                        />
                        <select
                          value={m.bonusType ?? "enhancement"}
                          aria-label={`${item.name} bonus type`}
                          onChange={(e) =>
                            updateModifier(item, mi, {
                              bonusType: e.target.value as (typeof BONUS_TYPES)[number],
                            })
                          }
                          className="h-8 rounded border border-border bg-background px-1 text-xs"
                        >
                          {BONUS_TYPES.map((b) => (
                            <option key={b} value={b}>
                              {b.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground">to</span>
                        <select
                          value={m.target ?? "ac"}
                          aria-label={`${item.name} bonus target`}
                          onChange={(e) => updateModifier(item, mi, { target: e.target.value })}
                          className="h-8 rounded border border-border bg-background px-1 text-xs"
                        >
                          {ITEM_TARGETS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-label="Remove bonus"
                          onClick={() => removeModifier(item, mi)}
                          className="tap-target text-muted-foreground hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
