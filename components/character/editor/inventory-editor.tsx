"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2, Zap, ChevronDown } from "lucide-react";
import { Coins, Backpack, GameIcon, itemIconName } from "@/components/ui/game-icons";
import type { EquipmentItem } from "@pathforge/schema";
import { BONUS_TYPES, EQUIP_SLOT_KEYS, EQUIP_SLOT_LABELS, TATTOO_SLOT_KEYS, AURA_STRENGTHS } from "@pathforge/schema";
import { NumberField, SelectField, TextField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";
import { AutomationEffectsEditor, skillTargetOptions } from "./automation-effects-editor";
import { Button } from "@/components/ui/button";
import { EntryCard } from "./entry-card";
import { StatChip } from "./picker-shell";
import { SlotDoll, slotLabel } from "../slot-doll";
import { formatModifier } from "@/lib/utils";

/**
 * Items Overhaul Stage 3 (docs/ITEMS_OVERHAUL/MASTER_PLAN.md "Staged rollout → Stage 3"): the
 * inventory editor onto the established <EntryCard> chip+disclosure language, plus slot/tattoo/held
 * placement, the wondrous-item statblock, and the live weapon→attack linked-sync surface. The
 * weapon↔attack sync itself already exists in the engine (`pf:weapon:<id>` computed attacks) — this
 * file only surfaces it; it creates nothing.
 */

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

/**
 * Bonus targets offered for an item. A weapon's to-hit belongs in its Enhancement field (per-weapon),
 * so the global "Melee atk"/"Ranged atk" targets are hidden for weapons to avoid double-counting and
 * cross-weapon leak — but a target already saved on an item stays selectable so editing never silently
 * rewrites it.
 */
function targetOptions(category: string, current?: string) {
  const base =
    category === "weapon"
      ? ITEM_TARGETS.filter((t) => t.value !== "attack.melee" && t.value !== "attack.ranged")
      : ITEM_TARGETS;
  if (current && !base.some((t) => t.value === current)) {
    return [...base, { value: current, label: current }];
  }
  return base;
}

type WeaponStats = NonNullable<EquipmentItem["weapon"]>;
const WEAPON_DEFAULTS: WeaponStats = {
  ranged: false,
  attackAbility: "str",
  damageAbility: "str",
  handed: "one",
  enhancement: 0,
};
type WondrousStats = NonNullable<EquipmentItem["wondrous"]>;

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

// Sentinels for the slot <select>s — never persisted as the stored value (translated to
// undefined/"" before writing to the draft).
const NONE_VALUE = "__none__";
const OTHER_VALUE = "__other__";

/**
 * A known-key <select> with a free-text "Other…" escape hatch — the KNOWN_CHAKRA_SLOTS precedent
 * (akashic.ts): a known-slot list drives the UI, but the stored field stays a free string so
 * homebrew/imported slot names are never rejected. `undefined` means unset; any other string not in
 * `knownKeys` is treated as a custom value and keeps the row in "Other…" mode.
 */
function SlotSelect({
  label,
  value,
  knownKeys,
  labels,
  onChange,
}: {
  label: string;
  value: string | undefined;
  knownKeys: readonly string[];
  labels: Record<string, string>;
  onChange: (next: string | undefined) => void;
}) {
  const known = value !== undefined && knownKeys.includes(value);
  const selectValue = value === undefined ? NONE_VALUE : known ? value : OTHER_VALUE;
  return (
    <div className="space-y-1">
      <SelectField
        label={label}
        value={selectValue}
        onChange={(v) => {
          if (v === NONE_VALUE) onChange(undefined);
          else if (v === OTHER_VALUE) onChange(value !== undefined && !known ? value : "");
          else onChange(v);
        }}
        options={[
          { value: NONE_VALUE, label: "— none / slotless —" },
          ...knownKeys.map((k) => ({ value: k, label: labels[k] ?? k })),
          { value: OTHER_VALUE, label: "Other…" },
        ]}
      />
      {selectValue === OTHER_VALUE && (
        <TextField label={`${label} (custom)`} value={value ?? ""} onChange={onChange} placeholder="Custom slot name" />
      )}
    </div>
  );
}

/** A nested disclosure (native `<details>`) for secondary per-item detail that shouldn't crowd the
 * primary stat block. `defaultOpen` follows the EntryCard idiom: a false→true CHANGE forces the
 * panel open (newly-set data must be visible), but it NEVER force-closes — `open={derived}` on a
 * `<details>` is a controlled attribute React re-asserts, and wiring it to live data snapped the
 * panel shut the instant a user cleared its last field, mid-edit (review finding, reproduced).
 * Native toggles sync back through onToggle so the user's choice always sticks. */
function SubDisclosure({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [prevDefault, setPrevDefault] = useState(defaultOpen);
  if (defaultOpen !== prevDefault) {
    setPrevDefault(defaultOpen);
    if (defaultOpen && !open) setOpen(true); // only ever force OPEN, never closed
  }
  return (
    <details
      className="group rounded-md border border-border/60"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden sm:min-h-9">
        <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        {title}
      </summary>
      <div className="space-y-2 border-t border-border/40 p-2">{children}</div>
    </details>
  );
}

/** Collapsed-card chip strip: category glyph, equipped state, slot/tattoo, qty, weight, hands, and
 * (weapons only) the live linked-attack chip or an "equip to activate" hint. Reads `ed.computed`
 * live on every render — no memoized snapshot, so the chip can never go stale after equipping. */
function buildChips(item: EquipmentItem, ed: CharacterEditorApi): ReactNode[] {
  const chips: ReactNode[] = [
    <StatChip
      key="cat"
      value={
        <span className="inline-flex items-center gap-1">
          <GameIcon name={itemIconName(item.category)} className="size-3.5 text-gold/80" />
          {item.category.replace(/_/g, " ")}
        </span>
      }
    />,
    <StatChip key="equipped" value={item.equipped ? "Equipped" : "Carried"} tone={item.equipped ? "good" : "neutral"} />,
  ];
  if (item.equipSlot) chips.push(<StatChip key="slot" label="Slot" value={slotLabel(item.equipSlot)} />);
  if (item.tattooSlot) chips.push(<StatChip key="tattoo" label="Tattoo" value={slotLabel(item.tattooSlot)} tone="rune" />);
  if ((item.quantity ?? 1) > 1) chips.push(<StatChip key="qty" label="Qty" value={`×${item.quantity}`} />);
  if (typeof item.weight === "number" && item.weight > 0) chips.push(<StatChip key="wt" label="Wt" value={`${item.weight} lb`} />);

  const hands = item.weapon
    ? item.weapon.handed === "two"
      ? 2
      : 1
    : item.heldSlot
      ? item.heldSlot === "two_hand"
        ? 2
        : 1
      : null;
  if (hands !== null) chips.push(<StatChip key="hands" label="Hands" value={hands} />);

  // The weapon↔attack "linked sync" already exists in the engine (compute.ts `pf:weapon:<id>`
  // attacks) — this is a READ of that existing computed value, not a new write path. Filling in the
  // weapon's stats + equipping it IS the linking action; there is nothing to "create". Every state
  // gets HONEST feedback (review finding: a weapon-category item whose weapon block was never
  // touched produced total silence — the stat-block UI shows plausible defaults, but nothing is
  // persisted and no attack generates until a weapon field is actually set):
  const hint = (key: string, text: string) => (
    <span
      key={key}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/60 px-1.5 py-0.5 text-[11px] italic text-muted-foreground"
    >
      {text}
    </span>
  );
  if (item.weapon) {
    if (item.equipped) {
      const atk = ed.computed.attacks.find((a) => a.id === `pf:weapon:${item.id}`);
      if (atk) {
        chips.push(
          <StatChip
            key="linked"
            tone="gold"
            label="Linked attack"
            value={
              <span className="inline-flex items-center gap-1">
                <Zap className="size-3" aria-hidden="true" />
                {`${formatModifier(atk.attackBonus)}${atk.damage ? ` · ${atk.damage}` : ""}`}
              </span>
            }
          />,
        );
      } else {
        // Equipped, weapon block present, yet the engine produced no attack (a suppression flag or
        // similar) — say THAT, not "equip to activate", which would be a lie here.
        chips.push(hint("linked-none", "no computed attack"));
      }
    } else {
      chips.push(hint("linked-hint", "equip to activate"));
    }
  } else if (item.category === "weapon") {
    // Category says weapon but the lazily-created weapon block doesn't exist yet — no attack will
    // generate no matter the equipped state. Point at the fix instead of staying silent.
    chips.push(hint("linked-unset", "set weapon stats to link an attack"));
  }
  return chips;
}

function ItemRow({
  item,
  ed,
  defaultOpen,
  updateItem,
  updateWeapon,
  updateWondrous,
  addModifier,
  updateModifier,
  removeModifier,
  setAutomation,
  removeItem,
}: {
  item: EquipmentItem;
  ed: CharacterEditorApi;
  defaultOpen: boolean;
  updateItem: (id: string, patch: Partial<EquipmentItem>) => void;
  updateWeapon: (item: EquipmentItem, patch: Partial<WeaponStats>) => void;
  updateWondrous: (item: EquipmentItem, patch: Partial<WondrousStats>) => void;
  addModifier: (item: EquipmentItem) => void;
  updateModifier: (item: EquipmentItem, mi: number, patch: Partial<EquipmentItem["modifiers"][number]>) => void;
  removeModifier: (item: EquipmentItem, mi: number) => void;
  setAutomation: (item: EquipmentItem, automation: EquipmentItem["automation"]) => void;
  removeItem: (id: string) => void;
}) {
  const hasOwnStatBlock = item.category === "weapon" || item.category === "armor" || item.category === "shield";
  const w = item.wondrous;
  const hasWondrousData = !!(
    w &&
    (w.auraSchool || w.auraStrength || w.casterLevel || w.constructionRequirements || w.constructionCost)
  );
  const hasPlacementData = !!(item.equipSlot || item.tattooSlot || item.heldSlot);

  const placementFields = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <SlotSelect
        label="Slot"
        value={item.equipSlot}
        knownKeys={EQUIP_SLOT_KEYS}
        labels={EQUIP_SLOT_LABELS}
        onChange={(v) => updateItem(item.id, { equipSlot: v })}
      />
      <SlotSelect
        label="Tattoo slot"
        value={item.tattooSlot}
        knownKeys={TATTOO_SLOT_KEYS}
        labels={EQUIP_SLOT_LABELS}
        onChange={(v) => updateItem(item.id, { tattooSlot: v })}
      />
      {item.category !== "weapon" && (
        <SelectField
          label="Held (hands)"
          value={item.heldSlot ?? NONE_VALUE}
          onChange={(v) =>
            updateItem(item.id, { heldSlot: v === NONE_VALUE ? undefined : (v as "one_hand" | "two_hand") })
          }
          options={[
            { value: NONE_VALUE, label: "— not held —" },
            { value: "one_hand", label: "One hand" },
            { value: "two_hand", label: "Two hands" },
          ]}
        />
      )}
    </div>
  );

  return (
    <EntryCard
      name={item.name}
      onNameChange={(v) => updateItem(item.id, { name: v })}
      onRemove={() => removeItem(item.id)}
      removeLabel={`Remove ${item.name}`}
      defaultOpen={defaultOpen}
      chips={buildChips(item, ed)}
    >
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Category"
          value={item.category}
          options={CATEGORIES.map((cat) => ({ value: cat, label: cat.replace(/_/g, " ") }))}
          onChange={(v) => updateItem(item.id, { category: v as EquipmentItem["category"] })}
          className="w-40"
        />
        <NumberField label="Qty" value={item.quantity} min={0} onChange={(v) => updateItem(item.id, { quantity: v })} className="w-20" />
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
        <label className="flex h-11 items-center gap-1.5 text-sm text-muted-foreground sm:h-10">
          <input
            type="checkbox"
            checked={!!item.equipped}
            aria-label={`${item.name} equipped`}
            onChange={(e) => updateItem(item.id, { equipped: e.target.checked })}
            className="size-4 accent-[var(--pf-gold)]"
          />
          Equipped
        </label>
      </div>

      {(item.category === "armor" || item.category === "shield") && (
        <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 p-2">
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

      {item.category === "weapon" && (
        <div className="space-y-2 rounded-md border border-border/60 p-2">
          <p className="text-[11px] text-muted-foreground">
            Weapon stats — an equipped weapon becomes a computed attack (BAB + ability + size + enhancement).
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex h-11 items-center gap-1.5 text-xs text-foreground sm:h-9">
              <input
                type="checkbox"
                checked={!!item.weapon?.ranged}
                aria-label={`${item.name} is a ranged weapon`}
                onChange={(e) => updateWeapon(item, { ranged: e.target.checked })}
              />
              Ranged
            </label>
            <SelectField
              label="Attack"
              value={item.weapon?.attackAbility ?? "str"}
              onChange={(v) => updateWeapon(item, { attackAbility: v as WeaponStats["attackAbility"] })}
              options={[
                { value: "str", label: "STR" },
                { value: "dex", label: "DEX" },
              ]}
              className="w-20"
            />
            <SelectField
              label="Grip"
              value={item.weapon?.handed ?? "one"}
              onChange={(v) => updateWeapon(item, { handed: v as WeaponStats["handed"] })}
              options={[
                { value: "one", label: "One-handed" },
                { value: "two", label: "Two-handed" },
                { value: "off", label: "Off-hand" },
                { value: "light", label: "Light" },
              ]}
            />
            <SelectField
              label="Dmg ability"
              value={item.weapon?.damageAbility ?? "str"}
              onChange={(v) => updateWeapon(item, { damageAbility: v as WeaponStats["damageAbility"] })}
              options={[
                { value: "str", label: "STR" },
                { value: "dex", label: "DEX" },
                { value: "none", label: "None" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <TextField
              label="Damage"
              value={item.weapon?.damageDice ?? ""}
              placeholder="1d8"
              onChange={(v) => updateWeapon(item, { damageDice: v || undefined })}
            />
            <NumberField
              label="Enhancement"
              value={item.weapon?.enhancement ?? 0}
              onChange={(v) => updateWeapon(item, { enhancement: v })}
            />
            <TextField
              label="Damage type"
              value={item.weapon?.damageType ?? ""}
              placeholder="S / P / B"
              onChange={(v) => updateWeapon(item, { damageType: v || undefined })}
            />
            <TextField
              label="Crit range"
              value={item.weapon?.critRange ?? ""}
              placeholder="19-20"
              onChange={(v) => updateWeapon(item, { critRange: v || undefined })}
            />
            <TextField
              label="Crit mult"
              value={item.weapon?.critMultiplier ?? ""}
              placeholder="×2"
              onChange={(v) => updateWeapon(item, { critMultiplier: v || undefined })}
            />
            <TextField
              label="Range"
              value={item.weapon?.range ?? ""}
              placeholder="30 ft"
              onChange={(v) => updateWeapon(item, { range: v || undefined })}
            />
          </div>
        </div>
      )}

      {hasOwnStatBlock ? (
        <SubDisclosure title="Advanced placement (slot / tattoo / held)" defaultOpen={hasPlacementData}>
          <p className="text-[11px] text-muted-foreground">
            For a magic weapon or shield that also occupies a body slot, or a held item that&apos;s slotless.
          </p>
          {placementFields}
        </SubDisclosure>
      ) : (
        <div className="rounded-md border border-border/60 p-2">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Placement</p>
          {placementFields}
        </div>
      )}

      <SubDisclosure title="Magic item details" defaultOpen={hasWondrousData}>
        <p className="text-[11px] text-muted-foreground">
          Flavor/statblock info (aura, caster level, construction) — descriptive only. This item&apos;s
          mechanical bonus still comes from Simple bonuses / Advanced effects below.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField
            label="Aura school"
            value={item.wondrous?.auraSchool ?? ""}
            placeholder="e.g. transmutation"
            onChange={(v) => updateWondrous(item, { auraSchool: v || undefined })}
          />
          <TextField
            label="Aura strength"
            value={item.wondrous?.auraStrength ?? ""}
            placeholder={AURA_STRENGTHS.join(" / ")}
            onChange={(v) => updateWondrous(item, { auraStrength: v || undefined })}
          />
          <NumberField
            label="Caster level"
            value={item.wondrous?.casterLevel ?? 0}
            min={0}
            onChange={(v) => updateWondrous(item, { casterLevel: v || undefined })}
          />
        </div>
        <TextField
          label="Construction requirements"
          value={item.wondrous?.constructionRequirements ?? ""}
          placeholder="Feats/spells required to craft"
          onChange={(v) => updateWondrous(item, { constructionRequirements: v || undefined })}
        />
        <TextField
          label="Construction cost"
          value={item.wondrous?.constructionCost ?? ""}
          placeholder="Distinct from the market price above"
          onChange={(v) => updateWondrous(item, { constructionCost: v || undefined })}
        />
      </SubDisclosure>

      <TextField
        label="Notes"
        value={item.notes ?? ""}
        onChange={(v) => updateItem(item.id, { notes: v })}
        placeholder="Properties, attunement, location…"
      />

      <div className="rounded-md border border-border/60 p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Simple bonuses (apply when equipped)
          </span>
          <Button size="sm" variant="ghost" onClick={() => addModifier(item)}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
        {item.modifiers.length === 0 ? (
          <p className="text-xs text-muted-foreground">None. Add e.g. +2 resistance to Fort, or +1 deflection to AC.</p>
        ) : (
          <div className="space-y-1.5">
            {item.modifiers.map((m, mi) => (
              <div key={m.id} className="flex flex-wrap items-center gap-1.5">
                <input
                  type="number"
                  value={typeof m.value === "number" ? m.value : 0}
                  aria-label={`${item.name} bonus value`}
                  onChange={(e) =>
                    updateModifier(item, mi, { value: e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)) })
                  }
                  className="tnum h-11 w-16 rounded border border-border bg-background px-2 text-sm md:h-10"
                />
                <select
                  value={m.bonusType ?? "enhancement"}
                  aria-label={`${item.name} bonus type`}
                  onChange={(e) => updateModifier(item, mi, { bonusType: e.target.value as (typeof BONUS_TYPES)[number] })}
                  className="h-11 rounded border border-border bg-background px-1 text-xs md:h-10"
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
                  className="h-11 rounded border border-border bg-background px-1 text-xs md:h-10"
                >
                  {targetOptions(item.category, m.target).map((t) => (
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

      <div className="rounded-md border border-border/60 p-2">
        <p className="text-[11px] text-muted-foreground">
          Advanced effects — for broad or scaling bonuses the simple bonuses above can&apos;t express. Apply only
          while this item is equipped. Targets all saves, all skills, Max HP, CMB/CMD, and ƒx formulas that scale
          off level/BAB.
          {item.category === "weapon" && " A weapon's own to-hit goes in its Enhancement field above."}
        </p>
        <AutomationEffectsEditor
          effects={item.automation}
          idPrefix="itemfx"
          defaultTarget="defenses.armorClass"
          skillTargets={skillTargetOptions(ed.draft)}
          hiddenTargets={item.category === "weapon" ? ["attack", "attack.melee", "attack.ranged"] : undefined}
          onChange={(next) => setAutomation(item, next)}
        />
      </div>
    </EntryCard>
  );
}

export function InventoryEditor({ ed }: { ed: CharacterEditorApi }) {
  const inv = ed.draft.inventory;
  const wealth = ed.draft.wealth;
  const items = ITEM_ARRAYS.flatMap((arr) => inv[arr].map((item) => item));
  const totalGp = wealth.pp * 10 + wealth.gp + wealth.sp / 10 + wealth.cp / 100;
  const carriedWeight = items.reduce((s, item) => s + (item.weight ?? 0) * (item.quantity ?? 1), 0);
  // The id of a just-added item, so its EntryCard mounts already-open for editing (mirrors FeatsEditor).
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const addItem = () => {
    const id = newId("item");
    ed.update((c) =>
      c.inventory.gear.push({
        id,
        name: "New item",
        category: "gear",
        quantity: 1,
        equipped: false,
        automation: [],
        modifiers: [],
        identified: true,
      }),
    );
    setOpenEntryId(id);
  };

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

  const updateWeapon = (item: EquipmentItem, patch: Partial<WeaponStats>) =>
    updateItem(item.id, { weapon: { ...WEAPON_DEFAULTS, ...item.weapon, ...patch } });

  // Lazy-create / clean-delete: the wondrous block only exists once a field is actually filled in,
  // and disappears again once every field is cleared — avoids empty-object churn in the 3-way merge.
  const updateWondrous = (item: EquipmentItem, patch: Partial<WondrousStats>) => {
    const next = { ...item.wondrous, ...patch };
    const isEmpty =
      !next.auraSchool && !next.auraStrength && !next.casterLevel && !next.constructionRequirements && !next.constructionCost;
    updateItem(item.id, { wondrous: isEmpty ? undefined : next });
  };

  const setModifiers = (item: EquipmentItem, modifiers: EquipmentItem["modifiers"]) => updateItem(item.id, { modifiers });
  const addModifier = (item: EquipmentItem) =>
    setModifiers(item, [
      ...item.modifiers,
      { id: newId("mod"), label: item.name, value: 0, target: "ac", bonusType: "enhancement", enabled: true },
    ]);
  const updateModifier = (item: EquipmentItem, mi: number, patch: Partial<EquipmentItem["modifiers"][number]>) =>
    setModifiers(item, item.modifiers.map((m, idx) => (idx === mi ? { ...m, ...patch } : m)));
  const removeModifier = (item: EquipmentItem, mi: number) => setModifiers(item, item.modifiers.filter((_, idx) => idx !== mi));

  const setAutomation = (item: EquipmentItem, automation: EquipmentItem["automation"]) => updateItem(item.id, { automation });

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

  // Gate the doll panel exactly like the read view (a Stage-2 review finding this editor initially
  // missed): a sheet that has never functionally touched the slot system must not open its
  // inventory to a 13-row all-"Empty" doll — a one-line hint carries discoverability instead.
  const slotsSummary = ed.computed.summary.equipmentSlots;
  const hasSlotActivity =
    Object.keys(slotsSummary.bySlot).length > 0 ||
    Object.keys(slotsSummary.tattoosBySlot).length > 0 ||
    slotsSummary.held.length > 0 ||
    slotsSummary.warnings.length > 0;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Backpack className="size-4" /> Equipment slots
        </h3>
        {hasSlotActivity ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <SlotDoll slots={slotsSummary} />
            <div className="flex flex-wrap items-end gap-3 border-t border-border/50 pt-3">
              <NumberField
                label="Hands available"
                value={inv.settings.handsAvailable}
                min={0}
                onChange={(v) => ed.update((c) => (c.inventory.settings.handsAvailable = Math.max(0, v)))}
                className="w-40"
                hint="Raise for multi-armed creatures, lower for one-handed builds."
              />
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
            Assign a body slot on an equipped magic item (or equip a weapon/held item) and the
            equipment doll appears here — slot conflicts and hands-in-use are tracked automatically.
          </p>
        )}
      </section>

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
            <ItemRow
              key={item.id}
              item={item}
              ed={ed}
              defaultOpen={item.id === openEntryId}
              updateItem={updateItem}
              updateWeapon={updateWeapon}
              updateWondrous={updateWondrous}
              addModifier={addModifier}
              updateModifier={updateModifier}
              removeModifier={removeModifier}
              setAutomation={setAutomation}
              removeItem={removeItem}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
