# Items / Inventory Overhaul — Master Plan

**Status:** PLANNING (docs-only leg, drafted 2026-07-11). No app code touched. Format follows
`docs/S6_UX_OVERHAUL/MASTER_PLAN.md` and `docs/3PP_MASTER_PLAN.md` — read those first if you haven't;
this doc assumes the same conventions (additive Zod, the compendium contract, §15 gating, the
chip+disclosure editor language, mobile-first).

## Goals

1. **Magic-item body slots** — the 13 core PF1e wondrous slots (Belt · Body · Chest · Eyes · Feet ·
   Hands · Head · Headband · Neck · Shoulders · Wrist · Ring L · Ring R), one item per slot, PLUS the
   Inner Sea Magic **tattoo sub-slots** (an independent second occupancy track), a single worn
   **armor** set + single **shield**, and **held** items (weapons, staves, rods) tracked against
   available hands. Violations are **warnings, never hard blocks** — PF1e tables run homebrew, and a
   sheet must never refuse to save because of a slot rule.
2. **A beautiful, mobile-first magic-item UI** — a paper-doll slot map is the desktop North Star (the
   owner supplied a silhouette-with-callouts reference); mobile gets an honest, different layout (a
   slot list, doll as a compact index), not a shrunken desktop map.
3. **Weapon → attack linked sync** — equip a weapon with combat stats and it already becomes a live
   entry in Attacks; the ask is to make that existing mechanism visible and trustworthy in the new UI,
   not to build a second one.
4. **A wondrous-item statblock** the player can fill in per item (name, source, aura + CL, slot, price,
   weight, description, construction requirements + cost), wired into the existing automation system.
5. **A future magic-item compendium** on the established contract (spell/sphere/PFcore pattern) — data
   sourcing is explicitly the owner's job, same as Spheres/PFcore/3pp were.

---

## Ground truth — what exists today (verified against the repo)

### Schema (`packages/pathforge-schema/src/inventory.ts`)

One shared `equipmentItemSchema` (id/name/category/quantity/weight/cost/equipped/description/notes/
source/identified) sits in five buckets on `inventoryBlockSchema`: `weapons`, `armorAndShields`,
`potionsScrollsMagicItems`, `gear`, `otherItems`. `category` is an enum (`weapon | armor | shield |
potion | scroll | wand | magic_item | gear | other`) but **which array an item lives in is decoupled
from category** — the editor's `CATEGORY_ARRAY` map (see below) is what actually files it.

Relevant existing fields on `equipmentItemSchema`:
- `equipped: boolean` — the ONE existing "is this active" flag. There is **no slot field at all**
  today; two armor items, three rings, or five belts can all be `equipped: true` simultaneously with
  no signal to the player.
- `armorBonus` / `maxDexBonus` / `armorCheckPenalty` — flat top-level numbers, feed AC/skills when
  `equipped` (see Engine below).
- `weapon?: { ranged, attackAbility, damageDice, damageAbility, handed, enhancement, critRange,
  critMultiplier, damageType, range }` — `handed` is `"one" | "two" | "off" | "light"`. This is the
  **only existing "how many hands does this take" signal** in the schema, and it only exists on
  weapons.
- `automation: AutomationEffect[]` and `modifiers: ModifierEntry[]` — the item's own effect lists, fed
  into the engine's modifier index whenever `equipped` (see `compute.ts:266-284`).
- `source?: sourceRefSchema` (`pack/book/page/module/custom/note`) and `description?: string` already
  exist — two of the wondrous-statblock fields the owner asked for are **already on the schema**, just
  unused by any "magic item" UI.

There is **no per-item slot, no tattoo concept, no hands-available concept, no aura/CL fields**. This
epic is additive on top of an otherwise-complete item model.

### A near-identical prior-art model already in the schema — Akashic chakra slots

`packages/pathforge-schema/src/akashic.ts` solved almost exactly this problem for veils:

```ts
export const KNOWN_CHAKRA_SLOTS = ["hands","feet","head","headband","neck","wrists","shoulders",
  "belt","chest","body","ring","blood"] as const;
```
with the comment *"Slot FIELDS stay free strings — the compendium carries nonstandard slots […];
never reject."* — i.e. a **known-slot list drives the UI, but the stored field is a free string**, so
homebrew/imported slot names are never rejected by the schema.

The engine (`packages/pathforge-rules-pf1e/src/akashic.ts:171-222`) computes slot occupancy and pushes
plain-English warnings — never a validation error:

```ts
const slotOccupants = new Map<string, string[]>();
// … for each enabled shaped veil, normSlot(s.slot) tracked in slotOccupants …
for (const [slot, names] of slotOccupants) {
  if (names.length > 1) warnings.push(`Chakra slot collision: ${names.join(" and ")} both occupy ${slot}.`);
}
```
returned as `AkashicSummary.warnings: string[]` under `computed.summary.akashic`. This is the exact
template for the new slot-conflict detector — see the [Slot model design](#slot-model-design) below.
`detectStackingConflicts` (`packages/pathforge-rules-pf1e/src/buffs.ts`) is the same "warn, never
block" idiom one level up (buff bonus-type collisions).

### Engine — armor → AC (`packages/pathforge-rules-pf1e/src/compute.ts`)

Equipped-item modifiers are folded in once, early, in `buildModifierIndex` (lines 266–284):

```ts
for (const item of allItems) {
  if (!item.equipped) continue;
  if (typeof item.armorBonus === "number" && item.armorBonus !== 0) {
    const bonusType: BonusType = item.category === "shield" ? "shield" : "armor";
    push("ac", { id: `armor-${item.id}`, label: item.name, source: item.name, value: item.armorBonus, bonusType });
  }
  for (const m of item.modifiers) push(classifyTarget(m.target ?? ""), modifierEntryToMod(item.name, m, resolver));
  for (const e of item.automation) push(classifyTarget(e.target), effectToMod(e.id, item.name, item.name, e, resolver));
}
```
`item.category === "shield"` picks the `shield` bonus type, anything else with an `armorBonus` is typed
`armor`. Both feed the `ac` domain in the stacking engine (`applyStacking`), which keeps only the
**highest** bonus per type — so today, equipping two suits of armor doesn't double the AC bonus (typed
stacking already self-corrects the number), but it also gives the player **zero visibility** that one
suit is dead weight. That's a UX gap this epic should close with a warning, not a math fix (the math is
already right).

Max-Dex cap: `CharacterResolver.maxDexPenalty()` (lines 667–679) takes the **lowest** `maxDexBonus`
among all equipped items with that field set — already correctly handles multiple armor/shield pieces.
`armorCheckPenalty` (lines 1191–1199, 1221) sums the **magnitude** of ACP across all equipped items and
feeds ACP-affected skills. Both of these loops iterate `allInventory(character)` — a module-private
helper (`compute.ts:563-571`, not exported from `index.ts`) that flattens all five buckets. **Not
currently exported** — the new slot-conflict computation will need the same flattening and should
either import it as a new named export or duplicate the five-array spread (both are one-liners; the
plan below adds it as an export since two systems will now need it).

### Engine — weapon → attack (`compute.ts:1278-1319`) — the "linked sync" ALREADY EXISTS

```ts
const weaponAttacks: ComputedAttack[] = allInventory(character)
  .filter((i) => i.equipped && i.weapon)
  .map((i) => {
    const w = i.weapon!;
    const atkMod = abilities[w.attackAbility]?.modifier ?? 0;
    const broad = stackTotal([...index.get(w.ranged ? "attack.ranged" : "attack.melee") ?? [], ...index.get("attack.all") ?? []]);
    const attackBonus = babTotal + atkMod + sizeMods.attackMod + w.enhancement + broad;
    // damage = dice + ability mod (handed-scaled) + enhancement
    return { id: `pf:weapon:${i.id}`, name: i.name, attackType: w.ranged ? "ranged" : "melee", attackBonus, damage, … };
  });
const attacks: ComputedAttack[] = [...manualAttacks, ...weaponAttacks];
```
**Every equipped item with a populated `weapon` sub-object already generates a live computed attack**,
namespaced `pf:weapon:<id>` specifically so it can never collide with a free-form manual `AttackEntry`
id (`weapon-attack.test.ts` locks this: id collision, disabled-when-unequipped, correct STR/DEX/size/
enhancement math, two-handed ×1.5 / off-hand ×0.5 damage scaling). Un-equip the item or clear its
`weapon` block and the attack disappears next recompute — "update weapon → attack updates with it" is
**already true today**, automatically, for every weapon in inventory. There is no separate "create a
linked attack" action anywhere in the schema or engine — equip + fill in weapon stats *is* the linking
action.

The gap is **UX, not engine**: `AttackEntry` (`packages/pathforge-schema/src/combat.ts`) has no
`weaponId` field, and `CombatEditor` (`components/character/editor/combat-editor.tsx:70-76`)
deliberately **excludes** `pf:weapon:` rows from its editable list ("weapon-generated computed attacks
… are excluded so they can never shadow a manual row's computed values") — so today a player who wants
to *see* that a weapon is live in Attacks has to leave Inventory, go to Combat, and recognize their
weapon's name in the list. There is no visible link between the item card and the attack it generates.
Nothing here should fork the mechanism; the plan below closes the *visibility* gap only (see
[Weapon ↔ attack linked-sync design](#weapon--attack-linked-sync-design)).

Note a real, pre-existing (not new) engine gap for context: weapon-generated attacks compute from a
hardcoded formula and never consult `conditionalModifiers` or any per-attack automation — a manual
`AttackEntry` can carry ad-hoc modifiers, a weapon-attack cannot. Out of scope for this epic (not asked
for); flagged here so it isn't rediscovered as a surprise later.

### Editor (`components/character/editor/inventory-editor.tsx`)

This file predates the S6/"mega polish" chip+disclosure redesign that already reached Classes/Feats/
Features/Traits/Race/Spells/Saves/AC/Skills (see CLAUDE.md "Editor chip+disclosure redesign", "Saves +
AC full editors", "Skills overhaul"). Inventory is the **one major editor surface still on the old
plain-form pattern**: every item renders as a flat bordered box with all fields visible at once (name /
category / qty / weight / cost / equipped checkbox), a conditional armor-stats sub-block, a conditional
weapon-stats sub-block, a "Simple bonuses" modifier-row list, and an `AutomationEffectsEditor` block —
no collapse, no chips, nothing mobile-considered beyond the general 44px sweep. `CATEGORY_ARRAY`
(lines 77-87) maps each `category` value to the array it's filed in (`weapon→weapons`,
`armor|shield→armorAndShields`, `potion|scroll|wand|magic_item→potionsScrollsMagicItems`,
`gear→gear`, `other→otherItems`) — changing an item's category re-files it between arrays live.
`AutomationEffectsEditor` is already reused here with `hiddenTargets={["attack","attack.melee",
"attack.ranged"]}` when `category === "weapon"` specifically to prevent a weapon's automation from
double-counting against its own `weapon.enhancement` to-hit — the same discipline must extend to
whatever new slot-scoped fields the wondrous statblock adds.

### Read view (`components/character/character-dashboard.tsx:1310-1383`)

`InventoryList` (fed by the §15-gated `vm.inventory`) already does an **Equipped/Carried split** —
`equipped.filter()` vs `carried.filter()`, headed sub-lists, a `ShowMore` cap of 10 on Carried. Each
`InvRow` renders a category glyph (`itemIconName`), name, a computed meta line (enhancement/damage/
crit/range/AC/ACP/cost/weight joined with " · "), notes (owner-only), and an "equipped" badge shown
only when the groups aren't already split by heading. **No slot grouping today** — equipped items are
one flat list, not clustered by body region. This is the natural place for the desktop paper-doll /
mobile slot-list to slot in (a new component sitting where `InventoryList` sits today, still gated by
the same `vm.inventory`).

### View-model (`lib/character/view-model.ts:536-556, 752-787`)

`CharacterViewModel.inventory.items[]` is a flat, already-gated (`gate("inventory", …)`) array; each
row: `name, quantity, equipped, category, armorBonus?, armorCheckPenalty?, notes?(owner-only), cost?,
weight?, weapon?{damage,damageType,crit,range,enhancement}`. **No slot/tattoo/held fields surfaced yet**
— adding them is additive to this type (new optional fields), same privacy gate, no new §15 section
needed (slots are more detail on the existing `inventory` section, not a new capability).

### Privacy (`lib/character/view-model.ts:43-112`)

`inventory` is already a first-class §15 section (`DEFAULT_SECTION_PRIVACY.inventory = "public"`,
`SECTION_LABELS.inventory = "Inventory"`) — the owner's 2026-06-28 "most things public" pass already
covers slots/held/tattoo since they're just more fields on the same gated array. **No new privacy
section required.**

### Compendium contract (migrations `0018` Spheres, `0021`–`0028` PFcore/3pp — now at `0029`)

Every compendium table so far follows one shape, verified in `supabase/migrations/0018_sphere_
compendium.sql` and `0023_compendium_distinct.sql`:
- `create table public.<x>_compendium (id uuid pk, … text columns …, search tsvector generated always
  as (…) stored, created_at)` + a GIN index on `search` + btree indexes on filter columns + a btree on
  `name` (the `0029` perf pass added these to every existing browse table — a future magic-item table
  should ship with its `name` index from day one, not bolted on later).
- RLS: `for select using (true)` (public read) + `for all using (auth.role() = 'service_role')` (writes
  locked to the loader).
- A `search_<table>(p_query text, p_limit int)` RPC on the **0026 ILIKE pattern** (substring `ilike` +
  `websearch_to_tsquery` OR-branch, ranked exact > prefix > substring > `ts_rank`) — the 0026 migration
  fixed a whole-word-only bug across all 19 PFcore RPCs; any new table's RPC must ship on this pattern
  from day one, not the older FTS-only pattern.
- `compendium_distinct(p_table, p_col)` already works generically for any table matching
  `^[a-z_]+_compendium$` — a `magic_item_compendium` table gets filter dropdowns for free, no new RPC.
- Table naming MUST end `_compendium` for `compendium_distinct` to accept it (D2 in the 3pp plan).

### Chip+disclosure editor primitives (already built, reusable as-is)

- `components/character/editor/entry-card.tsx` — `<EntryCard>`: collapsed name + chip strip, a
  chevron disclosure opens the full editor; render-phase "adjust on prop change" pattern so a
  caller can force-open a just-added row without fighting React's mount-only initial state. This is
  the "beautiful chips by default" primitive for each item card.
- `components/character/editor/picker-shell.tsx` — `<PickerShell>`, `<PickerSearch>`, `<PickerList>`,
  `<PickerRow>`, `<PickerDetail>`, `<StatChip>`, `<Segmented>`, `<ThreeppSystemBadge>`,
  `<PickerDivider>` — the shared chrome every compendium picker (feat/trait/class/archetype/prestige/
  race/class-option) already uses. A future `<MagicItemPicker>` reuses these verbatim.
- `components/character/editor/automation-effects-editor.tsx` — `<AutomationEffectsEditor>` +
  `AUTOMATION_TARGET_OPTIONS` + `skillTargetOptions()` — already wired into `InventoryEditor` per-item;
  the wondrous statblock's automation stays on this exact component, no fork.
- `components/character/editor/collapsible-group.tsx` — `<CollapsibleGroup>` (chevron + count badge,
  `COLLAPSE_WHEN_OVER = 12`, `forceOpen` escape hatch) — the pattern for grouping a long Carried list or
  a long slot list without a wall of scroll. The `forceOpen` gotcha (adding into a collapsed group must
  wire `forceOpen` or the new entry is invisible) applies here exactly as it did for spells/powers/
  maneuvers/spheres.
- `components/character/editor/section-summary.tsx:123-139` — the Modern editor's "equipment" chip
  summary (Items count, ≈GP) — needs a third chip once slots exist (e.g. a `Slots 6/13` or a warning
  dot when `computed.summary.equipmentSlots.warnings.length > 0`), mirroring how `skills` already adds
  a conditional "BG" chip.

### RSC boundary (CLAUDE.md, `[[pathforge-rsc-function-props]]`)

A paper-doll component reused by BOTH the read view (Server Component, `character-dashboard.tsx`) and
the editor (Client Component) must take **serializable props + `children` only** in the shape any
Server Component can pass — no `onSlotClick` function prop threading through the shared component. The
editor's interactive version needs its own thin `"use client"` wrapper that owns the click state and
composes the shared presentational SVG/markup; the read view renders the same presentational piece with
no handlers at all (a slot is just a fact on read view, not a control). This mirrors how
`SheetViewSwitch` swaps server-rendered nodes instead of passing render functions across the boundary.

### 3-way merge (`lib/character/merge.ts:60-67`)

`EquipmentItem` arrays already merge **by `id`**, not index (`isEntityArray` requires every element to
carry a stable string `id`, which they already do) — every new field this epic adds is just another key
inside an already-id-merged entity, so concurrent edits (S5b conflict handling) need no new merge logic.
A genuine same-item-same-field conflict (both sides re-equip the same item into different slots) surfaces
as an ordinary field conflict already, no special-casing required.

### Imports ("never silently discard data")

`packages/pathforge-importers/src/{mythweavers-json,foundry-pf1-actor-json}.ts` construct
`EquipmentItem` rows today with no slot/tattoo/held fields at all (verified: neither adapter sets
anything beyond id/name/category/quantity/equipped/automation/modifiers/identified) — so an import today
produces items that are simply **unassigned** (no slot) under the new model. That's the correct, safe
default: an unassigned wondrous item is not an error, just undecorated data waiting for the player to
drag it onto a slot. Nothing needs to change in the importers for this epic to ship safely; a follow-up
could teach the parsers to *guess* a slot from the item name (regex on "Belt of…", "Cloak of…" etc.) but
that is optional polish, not a blocker, and risks false-positive slot assignment more than it helps — see
[Risks](#risks).

---

## Slot model design

Four independent occupancy **tracks**, matching real PF1e rules structure (armor/shield are their own
equipment category, not one of the 13 wondrous slots; tattoos are explicitly a *second* track that
coexists with the main slot per Inner Sea Magic's whole design point):

| Track | What occupies it | Cardinality |
|---|---|---|
| **A — Body slots** | Wondrous items | 1 item per slot, 13 slots |
| **B — Tattoo slots** | Inner Sea Magic tattoos | 1 tattoo per slot, 11 of the 13 (no eyes/headband — armor/shield aren't slots to begin with) |
| **C — Worn** | Armor, Shield | 1 armor + 1 shield |
| **D — Held** | Weapons, staves, rods | capacity = hands available (default 2) |
| *(untracked)* | Everything else (potions, gear, most rings-that-are-actually-slotless-in-this-model-no—see below, scrolls, wands not worn, misc gear) | unlimited |

All four tracks are **additive fields on the existing `equipmentItemSchema`** — no new top-level
inventory buckets, no migration of existing items required (every field is optional; an item with none
of them set behaves exactly as it does today).

### Schema additions (`packages/pathforge-schema/src/inventory.ts`)

```ts
/** The 13 core PF1e wondrous-item body slots. Free-string storage (KNOWN_CHAKRA_SLOTS precedent,
 * akashic.ts) — homebrew/imported slot names are never rejected; this list only drives the UI +
 * the known-slot grouping/label lookup. */
export const EQUIP_SLOT_KEYS = [
  "belt", "body", "chest", "eyes", "feet", "hands", "head", "headband",
  "neck", "shoulders", "wrist", "ring_left", "ring_right",
] as const;
export type EquipSlotKey = (typeof EQUIP_SLOT_KEYS)[number];
export const EQUIP_SLOT_LABELS: Record<string, string> = {
  belt: "Belt", body: "Body", chest: "Chest", eyes: "Eyes", feet: "Feet", hands: "Hands",
  head: "Head", headband: "Headband", neck: "Neck", shoulders: "Shoulders", wrist: "Wrist",
  ring_left: "Ring (left)", ring_right: "Ring (right)",
};

/** Tattoo sub-slots (Inner Sea Magic) — an INDEPENDENT second occupancy track, not a restriction on
 * the main list. Excludes armor/eyes/headband/shield per the owner's brief. */
export const TATTOO_SLOT_KEYS = [
  "belt", "body", "chest", "feet", "hands", "head", "neck", "shoulders",
  "wrist", "ring_left", "ring_right",
] as const;
export type TattooSlotKey = (typeof TATTOO_SLOT_KEYS)[number];
```

On `equipmentItemSchema`, add (all optional, all additive):

```ts
/** Track A: which of the 13 wondrous slots this item occupies when equipped. Free string — see
 * EQUIP_SLOT_KEYS for the known list; an unrecognized value still renders (as "Other"/unassigned in
 * the doll) rather than being rejected. Leave unset for slotless items (most potions/gear/many rings
 * that explicitly don't take the ring slot — rare but real). */
equipSlot: z.string().optional(),
/** Track B: the Inner Sea Magic tattoo sub-slot this item occupies, if it's a tattoo. Independent of
 * equipSlot — a belt-tattoo and a belt-slot wondrous item can be worn simultaneously. */
tattooSlot: z.string().optional(),
/** Track D: hands consumed when this is a non-weapon HELD item (staff/rod/wand-as-held). Weapons
 * already encode this via weapon.handed; this field exists for items with no `weapon` block. */
heldSlot: z.enum(["one_hand", "two_hand"]).optional(),
```

On `inventoryBlockSchema`, add a `settings` object mirroring the existing `character.skills.settings`
precedent (`compute.ts` already reads `character.skills.settings.armorCheckPenaltyApplies` the same
way):

```ts
settings: z.object({
  /** Hands available for holding weapons/staves/rods. Default 2; raise for multi-armed creatures
   * (some monstrous PCs / templates), lower for one-handed builds. Warn-only, never blocks equipping. */
  handsAvailable: z.number().int().min(0).default(2),
}).default({}),
```

Zod's `.default({})` backfills on parse — `packages/pathforge-schema/src/factory.ts`'s
`createDefaultCharacter()` needs **no edit** for this to work (every other `.default(...)`-only field in
that factory already relies on the same backfill behavior).

### Engine: `computeEquipmentSlots` (new file, `packages/pathforge-rules-pf1e/src/equipment-slots.ts`)

Modeled directly on `computeAkashic`'s slot-collision block (`akashic.ts:171-222`) and
`detectStackingConflicts` (`buffs.ts`) — same "collect occupants, warn on collision" shape, same
`warnings: string[]` contract, always computed (this is core PF1e, not an optional module — unlike
`summary.akashic`/`summary.mythic` which are gated behind `isModuleKeyEnabled`).

```ts
export type EquipmentSlotsSummary = {
  bodySlots: Record<string, { itemId: string; itemName: string }[]>;   // Track A, keyed by equipSlot
  tattooSlots: Record<string, { itemId: string; itemName: string }[]>; // Track B, keyed by tattooSlot
  armor: { itemId: string; itemName: string }[];                        // Track C (armor-category, equipped)
  shields: { itemId: string; itemName: string }[];                      // Track C (shield-category, equipped)
  handsUsed: number;                                                    // Track D
  handsAvailable: number;
  warnings: string[];
};

export function computeEquipmentSlots(character: PathForgeCharacterV1): EquipmentSlotsSummary {
  const items = allInventory(character).filter((i) => i.equipped);
  // Track A/B: group by equipSlot / tattooSlot, warn when a slot's occupant list.length > 1.
  // Track C: group armorAndShields by category === "armor" | "shield", warn similarly (closes the
  //   silent-stacking-cap gap noted in Ground Truth — the AC math was already right, the player just
  //   never knew a second suit was dead weight).
  // Track D: hands used = Σ over items with `weapon` (handedToHands(weapon.handed)) or `heldSlot`
  //   ("one_hand"→1, "two_hand"→2) or category === "shield" (→1, RAW: a shield occupies a hand) —
  //   warn when handsUsed > handsAvailable. Never blocks equipping (per the owner's brief).
  ...
}
```

`allInventory` needs to become an **exported** helper from `compute.ts` (it is currently module-private,
`compute.ts:563`) — both this new file and the existing ACP/max-Dex loops need the same flatten, and
duplicating the five-array spread a third time is the wrong call once two systems share it. Export it
from `index.ts` alongside `classifyTarget`.

Wire into `computeCharacter()`'s return (`compute.ts:1554+`) as `summary.equipmentSlots:
computeEquipmentSlots(character)` — always present, no `isModuleKeyEnabled` gate (parallel to
`summary.hp`/`summary.speed`, not to `summary.mythic`).

### View-model (`lib/character/view-model.ts`)

Extend the existing gated `inventory` block (no new privacy section):
```ts
items: Array<{ …existing…; equipSlot?: string; tattooSlot?: string; heldSlot?: "one_hand"|"two_hand" }>
slotWarnings: string[]; // passthrough of computed.summary.equipmentSlots.warnings
```
`slotWarnings` is presentation guidance, not owner-only data — visible to every viewer who can see the
`inventory` section at all (a GM auditing a sheet should see the same "two belts equipped" warning the
owner sees).

### Why warnings, not blocks

This mirrors three existing precedents in the codebase exactly: `detectStackingConflicts` (buff bonus
collisions), Akashic chakra-slot collisions, and Akashic capacity-cap overspend — all three compute,
never reject. PF1e tables run enormous amounts of homebrew (an owner-signed conjured item, a GM reward
that ignores slot rules, a template creature with three heads each wearing a headband). A hard block on
save would be a regression against the entire codebase's design language *and* would risk data loss for
any imported sheet that already has slot conflicts baked in from a messy Myth-Weavers export. The
`equipSlot` field itself being a free string (not a strict enum) is the same tolerance one layer down.

---

## Wondrous-item data model

Most of the owner's requested statblock fields **already exist** on `equipmentItemSchema` — the gap is
just the magic-specific ones:

| Statblock field | Where it lives |
|---|---|
| name | `EquipmentItem.name` (existing) |
| source | `EquipmentItem.source` (existing `sourceRefSchema` — book/page/pack/module/custom/note) |
| price | `EquipmentItem.cost` (existing, free-text like the rest of the sheet's cost fields) |
| weight | `EquipmentItem.weight` (existing) |
| description | `EquipmentItem.description` (existing) |
| slot | `EquipmentItem.equipSlot` (new, above) |
| aura + CL | **new** |
| construction requirements + cost | **new** |

New nested object (additive, mirrors the existing `weapon: {...}` sub-object pattern rather than
scattering more flat top-level fields):

```ts
wondrous: z.object({
  auraSchool: z.string().optional(),       // e.g. "transmutation"
  auraStrength: z.enum(["faint", "moderate", "strong", "overwhelming"]).optional(),
  casterLevel: z.number().int().optional(),
  constructionRequirements: z.string().optional(), // feat/spell prereqs, free text
  constructionCost: z.string().optional(),          // distinct from market `cost` (price) above
}).optional(),
```

This block is purely descriptive/flavor (like `description`) — it does not feed the engine. The item's
**mechanical** effect continues to go through the exact same two paths every other item already uses:
`item.modifiers` (simple single-stat bonuses — the existing "Simple bonuses" UI in `InventoryEditor`)
and `item.automation` (the shared `<AutomationEffectsEditor>`, already wired in with the weapon
double-count guard). No new automation plumbing — a magic item's ring-of-protection-style deflection
bonus is authored exactly the same way it is today, the wondrous block only adds the flavor text a
player would want to read on the item card (aura, CL, construction — the things a Spellcraft check or
an Item Creation feat cares about).

---

## Weapon ↔ attack linked-sync design

**Do not fork the mechanism.** `pf:weapon:<id>` computed attacks (`compute.ts:1278-1319`,
`weapon-attack.test.ts`) already are the linked sync: equip an item with a populated `weapon` block and
it appears in `computed.attacks` under that namespaced id; change any weapon stat and the attack updates
next recompute; un-equip and it disappears. This is exactly "update weapon → attack updates with it."

The work here is **UX**, three pieces:

1. **Surface the live attack on the item's own card.** The weapon's `EntryCard` (in the redesigned
   `InventoryEditor`) reads `ed.computed.attacks.find(a => a.id === \`pf:weapon:${item.id}\`)` and shows
   a small live chip — "→ +11 to hit, 1d8+4" — right on the collapsed card, so equipping a weapon and
   seeing its attack line requires zero navigation. This is a **read**, not a new write path — the
   existing computed value, just rendered where the player is already looking.
2. **A "View in Attacks" affordance**, not a "Create linked attack" button that does anything — because
   there is nothing to create. Filling in the weapon's grip/damage/enhancement fields (already the
   editor's weapon-stats block) *is* the entire linking action. The owner's brief phrase "Create a
   linked attack" should read in the new UI as a **label/badge state** ("Linked attack" ⚡, present
   whenever `equipped && weapon` is truthy), not a button — a button implies an action the player must
   remember to take, when the actual behavior is "it just works the moment you equip it." Naming it as
   an always-on badge instead of a button is a deliberate correction to the brief's phrasing, grounded in
   how the engine actually behaves; call this out explicitly to the owner when the slice ships.
3. **Feed the new hands-tracking (Track D) into the same UI.** A weapon card's collapsed chips gain a
   "hands: 1" / "hands: 2" chip sourced from `weapon.handed` (already stored), and the Combat section of
   the equipment slot summary shows `handsUsed / handsAvailable` with the same warn-only styling as every
   other slot conflict — so "you've equipped three one-handed weapons with two hands" reads as one more
   entry in the same warnings list, not a special case.

`AttackEntry` gets **no new field** in this design (no `weaponId`) — the manual-attack list and the
weapon-generated list stay the two lanes they already are (`CombatEditor` already filters
`pf:weapon:` out of the editable manual list for exactly this separation). If a future need arises for a
weapon-attack to carry ad-hoc `conditionalModifiers` (the pre-existing gap noted in Ground Truth), that's
a distinct, separately-scoped follow-up — not part of "linked sync," which is already solved.

---

## Paper-doll UI concept

No reference image was available to this planning pass (checked `docs/mockups/`,
`docs/ITEMS_OVERHAUL/`, and the S6 mockup folder — nothing paper-doll-shaped exists in the repo yet).
The design below is this plan's best-effort interpretation of "a character silhouette with labeled slot
callouts," built from the S6 viewer/companion mockup token language; treat it as a strong starting point
for the owner to redline, not gospel. `docs/ITEMS_OVERHAUL/mockups/item-slots.html` renders it as a
static, self-contained mockup (real `--pf-*` tokens copied from `docs/S6_UX_OVERHAUL/mockups/
companion-sheet.html`, desktop + mobile frames side by side, per the S6 convention).

### Desktop — the paper-doll silhouette

A simple inline SVG humanoid outline (head/shoulders/torso/arms/legs — no anatomical detail, this is an
icon, not art) with a small dot + leader line at each of the 13 slot positions, matching the owner's
"silhouette with labeled callouts" description:

- **Occupied slot** → gold dot, filled, the leader line ends in a small chip showing the item name.
- **Empty slot** → muted/outline dot, the leader line ends in the slot label only ("Belt — empty").
- **Tattoo present** on a slot that shares a body region → a small rune-blue ring around the dot (a
  second, independent indicator layered on the same visual position — because tattoos genuinely coexist
  with a body-slot item there, this needs to read as "both," never as a replacement icon).
- Tapping/clicking a dot (editor only — the read view's doll has no click handlers, RSC-safe per the
  boundary note above) scrolls/opens that slot's `EntryCard` in the panel beside the doll, mirroring how
  the Classic editor's chip jump-rail already scrolls to a zone (`character-editor.tsx`'s `jump`/
  `subAnchor` pattern — reuse that scroll-to-anchor idiom rather than inventing a new one).
- Armor/Shield/Held don't live on the doll at all (they aren't body slots) — they get their own compact
  row above or beside it: an armor chip, a shield chip, and a "Hands: 1/2" chip, using the same
  occupied/empty/warning visual language.

### Mobile — THE priority, honest about 375px

A silhouette with 13 precise callout leader-lines does not survive to a 375px viewport without either
becoming illegible or requiring pinch-zoom (a real UX failure the mobile-first standing rule
(`[[pathforge-mobile-first-ui]]`) exists to prevent). Mobile gets a **different layout**, not a scaled
one:

- A **compact doll strip** at the top — the same silhouette shrunk to a small fixed-size glyph (roughly
  80×120px, sitting in the section header the way the companion mockup's portrait sits in its infobox),
  with occupied slots as small gold dots and nothing else interactive on it — purely a status-at-a-glance
  index, not a navigation control. No leader lines, no labels on the glyph itself at this size.
  Reduced-`data-motion` rule applies to any dot pulse/highlight exactly like the rest of the app.
- Below it, a **flat slot LIST** — one row per slot (occupied or empty), in a fixed anatomical order
  (head → headband → eyes → neck → shoulders → body → chest → wrist → hands → belt → ring L → ring R →
  feet), each row an `<EntryCard>`-style tap target (44px minimum) showing the slot label + occupant
  name (or "Empty") + the tattoo indicator inline. Tapping opens that slot's item editor in place
  (same disclosure pattern every other mobile editor already uses — no separate bottom sheet needed,
  consistent with how Classes/Feats/Traits already expand in place on mobile).
- Armor/Shield/Held sit as three more rows in the same list, not a separate mini-doll — one continuous
  scroll, matching how the mobile full-screen section navigator already treats every sheet section as a
  flat, deep-linkable list (`docs/MOBILE_NAV_AND_POLISH_PLAN.md`'s Part A).
- Slot warnings (Track A/B/C/D collisions) render as a small warning banner **above the list**, listing
  every `computed.summary.equipmentSlots.warnings` entry — the same warn-only styling used elsewhere
  (`GestaltCollapseBanner`'s amber-warning treatment is the closest existing visual precedent, though
  this is informational-only with no one-click fix action).

### Both layouts share

- The exact same underlying data (`computed.summary.equipmentSlots` + the per-item `equipSlot`/
  `tattooSlot`/`heldSlot` fields) — desktop and mobile are two renderers over one computed shape, not two
  separate data paths (this is the same discipline the read-view/editor split already follows
  everywhere else in the app).
- The same `<EntryCard>` chip+disclosure primitive for the actual item editing once a slot is tapped —
  the doll/list is only ever a *finder*, never a second place to edit item fields.

---

## Magic-item compendium phase (future, data-blocked)

Follows the established contract exactly (Spheres `0018`, PFcore `0021`–`0026`, 3pp `0027`/`0028`):

- **Table:** `magic_item_compendium` — `id uuid pk, name text, slot text, aura_school text,
  aura_strength text, caster_level int, price text, weight numeric, description text,
  construction_requirements text, construction_cost text, source text, category text (wondrous | ring |
  rod | staff | wand | armor | weapon | …), search tsvector generated always as (…) stored, created_at`
  — GIN on `search`, btree on `name` (from day one, per the `0029` lesson), btree on `slot` and
  `category` for filter dropdowns (or rely on `compendium_distinct`, same as every other browse page).
- **RLS:** public read, service-role write — identical boilerplate to every existing compendium table.
- **Search RPC:** `search_magic_item_compendium(p_query, p_limit)` on the **0026 ILIKE pattern** from
  the start (no separate "fix the whole-word bug" migration needed later, unlike PFcore's first pass).
- **Browse page:** a thin `CompendiumConfig` page (`/magic-items`) added to the `/compendium` hub,
  reusing the native `<details>`/`<summary>` full-detail accordion + shared `<Prose>`/`hasText()`
  helpers every other browse page already uses (`compendium-browser.tsx`) — zero new client JS.
- **Picker:** `<MagicItemPicker>` on the `picker-shell.tsx` primitives (search → list → detail), wired
  into the item `EntryCard`'s disclosure the same way `<ClassCompendiumPicker>`/`<FeatPicker>` wire into
  their editors — selecting a compendium row pre-fills name/slot/aura/CL/price/weight/description/
  construction fields (and seeds `automation[]` from a `magic_item_effect` seed table the same way
  `feat_effect` seeds Phase 3's feat automation, **if** the owner's sourced data includes structured
  effect rows — otherwise it's flavor-only pre-fill, same honest-skip precedent as Phase 8's mythic
  path-ability picker when the data didn't support it).
- **Data sourcing is explicitly the owner's job**, exactly as it was for Spheres (6 TSVs), PFcore (25
  TSVs), and 3pp (20 TSVs) — this phase does not start until a normalized dataset (CSV/TSV, one row per
  item, the fields above) exists. No placeholder/AI-generated item data should ever be seeded — every
  other compendium in this codebase carries a `source` citation on every row, and magic items are no
  exception.

This phase is **entirely decoupled** from the slot model + UI work above — a player can hand-enter every
field on a wondrous item (as they already do for weapons/armor today) with zero compendium in place. The
compendium only removes hand-typing later; it does not gate the slot system shipping.

---

## Staged rollout

Each stage gate-green (`pnpm lint && pnpm test && pnpm typecheck`, prod build) before the next starts,
per an adversarial Workflow review on every substantive stage (the standing discipline for every epic in
this codebase) — no schema/engine stage ships unreviewed.

### Stage 1 — Schema + engine (S)
- `EQUIP_SLOT_KEYS`/`EQUIP_SLOT_LABELS`/`TATTOO_SLOT_KEYS`, the `equipSlot`/`tattooSlot`/`heldSlot`/
  `wondrous` additions to `equipmentItemSchema`, `inventoryBlockSchema.settings.handsAvailable`.
- Export `allInventory` from `compute.ts`/`index.ts`.
- `packages/pathforge-rules-pf1e/src/equipment-slots.ts` (`computeEquipmentSlots`), wired into
  `computeCharacter()` as `summary.equipmentSlots` (always-on, no module gate).
- Unit tests (new `equipment-slots.test.ts`, mirroring `akashic.test.ts`'s collision-warning tests):
  two items same `equipSlot` → warning + both still function; a tattoo + body-slot item sharing a
  region → no warning (independent tracks); two armor / two shields → warning; hands over-committed
  (3 one-handed weapons, 2 hands) → warning; nothing set on any item → zero warnings, unchanged
  behavior (regression guard that this is truly additive).
- **Review point:** does the free-string `equipSlot` design actually resist rejecting homebrew input
  end-to-end (factory defaults, `parseCharacter`, the merge path)? Does `handsAvailable` interact
  sanely with a companion's existing `companion.type` (a Tiny familiar realistically can't equip most
  wondrous items — confirm nothing here *forces* a slot decision on companion sheets, since the
  Companion Simple editor (S6 Pillar 1) intentionally hides the full Modern editor's depth).

### Stage 2 — View-model + read view (S/M)
- `slotWarnings` + per-item slot fields into `CharacterViewModel.inventory`.
- The paper-doll read-view components: a shared presentational doll (`components/character/slot-doll.tsx`
  or similar — serializable props only, RSC-safe) + a slot-grouped variant of `InventoryList` used
  when any item has an `equipSlot`/`tattooSlot` set (falls back to today's flat Equipped/Carried view
  when nothing does — never a jarring empty doll for every pre-existing sheet).
- **Review point:** privacy — confirm `slotWarnings` and the new fields only ever reach a viewer who
  already passes the `inventory` gate (no bypass, mirroring the exact class of bug the Spheres pass
  caught and fixed — "the spheres section bypassed §15 gating"). Confirm the doll never crashes on a
  companion/animal sheet with zero wondrous items.

### Stage 3 — Editor overhaul (M/L)
- `InventoryEditor` rewritten onto `<EntryCard>` + the wondrous statblock disclosure + the interactive
  doll (desktop) / slot list (mobile) — this is also the moment Inventory finally joins the rest of the
  editor's chip+disclosure language (closing the gap noted in Ground Truth).
- The weapon-card live-attack chip + hands chip (Weapon ↔ attack section above).
- `section-summary.tsx`'s "equipment" chip summary gains a slots/warning indicator.
- **Review point:** the RSC boundary (shared doll component, no function props crossing it), the
  weapon double-count guard extends cleanly to any new automation surface, mobile 375px real-browser
  verification of the slot list (not just class-guaranteed responsive classes — actually screenshot it,
  per the standing "real-browser verification" discipline that caught the mobile grid blowout during
  the sheet-depth audit).

### Stage 4 — Magic-item compendium (XL, data-blocked)
- Starts only once the owner delivers a sourced dataset. Migration + loader + browse page + picker, on
  the contract described above. Independently reviewable/shippable from Stages 1–3.

---

## Risks

- **Mobile overflow on the doll.** A 13-point silhouette is the single highest risk of an
  unreadable/overflowing widget on a 375px viewport — mitigated by explicitly NOT trying to make the
  interactive doll work on mobile at all (compact glyph + flat list instead, per the UI concept above).
  Verify with a real browser at 375px, not just responsive Tailwind classes (the mobile grid blowout
  precedent from the sheet-depth audit is the exact failure mode to avoid repeating).
- **Privacy leak class.** Every new field rides the existing `inventory` gate, but the Spheres pass
  found a real precedent for this exact mistake (a system computed correctly but rendered ungated) —
  the Stage 2 review must explicitly verify `slotWarnings` and the doll data pass through `gate(
  "inventory", …)` and nowhere else.
- **3-way merge / concurrent edits.** Low risk — confirmed above that `EquipmentItem` already merges by
  `id`, so new fields are ordinary field-level merges. The one edge case worth a test: two clients
  equip *different* items into the *same* slot concurrently (both sides' `equipSlot` write survives
  disjointly since they're on different item ids — the resulting double-occupancy is exactly what the
  warning system is for, not a merge bug to "fix").
- **"Never silently discard data" for imports with unknown slots.** Already satisfied by construction —
  `equipSlot` is a free-string optional field imports simply don't set yet; nothing is lost, nothing is
  guessed incorrectly. The temptation to add name-sniffing slot-guessing to the importers should be
  resisted until there's real fixture evidence it helps more than it mis-slots (a wrongly-guessed slot
  that silently displaces a correct one is a worse outcome than "unassigned, player sorts it out").
- **Homebrew slot names never rendering meaningfully in the doll.** An `equipSlot` value that isn't in
  `EQUIP_SLOT_KEYS` (a 3pp table's exotic slot, a typo, an old import) needs an explicit "Other/
  unassigned" bucket in BOTH the doll and the slot list — never silently dropped from view. This is the
  same tolerance Akashic already had to solve for `KNOWN_CHAKRA_SLOTS` (its compendium literally
  includes "Storm"/"Interface"/"Special" nonstandard slots) — reuse that precedent's UI answer, don't
  re-derive one.
- **Hands-tracking false positives.** A shield RAW occupies a hand for two-weapon-fighting purposes but
  many tables don't track that strictly; a buckler is an explicit RAW exception (doesn't occupy the
  shield-hand the way a normal shield does). This plan folds shields into hand-consumption as a
  simplification and flags it as a known rough edge — since the whole system is warn-only, an
  occasionally-wrong hands warning is low-cost (the player can just... ignore a warning), but it's worth
  a one-line settings override (`heldSlot` on a buckler-tagged shield item, or simply not counting
  shields as hand-consuming and living with the RAW inaccuracy) — a call for whoever implements Stage 1,
  not resolved definitively here.
- **Wondrous-item automation double-counting**, same shape as the existing weapon guard
  (`hiddenTargets={["attack","attack.melee","attack.ranged"]}` when `category === "weapon"`) — a
  wondrous item's `automation[]` must not be allowed to double up against a slot-specific bonus the UI
  might someday compute directly (it doesn't today — the wondrous block is flavor-only, see above — but
  if a future stage adds any derived-from-slot mechanical effect, e.g. "belt slot items commonly grant
  Str/Dex/Con," this guard needs to be re-examined before automation is layered on top of it).
