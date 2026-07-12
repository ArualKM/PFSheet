import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { EQUIP_SLOT_LABELS } from "@pathforge/schema";
import { allInventory } from "./compute";

/**
 * Equipment slot occupancy (Items Overhaul Stage 1, docs/ITEMS_OVERHAUL/MASTER_PLAN.md). Four
 * independent occupancy tracks, modeled directly on `computeAkashic`'s slot-collision block
 * (akashic.ts) and `detectStackingConflicts` (buffs.ts) — collect occupants, warn on collision,
 * NEVER block a save. This is core PF1e (unlike `summary.akashic`/`summary.mythic`), so it is
 * always computed with no `isModuleKeyEnabled` gate.
 *
 * Track A — the 13 wondrous body slots (`equipSlot`).
 * Track B — Inner Sea Magic tattoo sub-slots (`tattooSlot`) — an INDEPENDENT second track; a belt
 *   item + a belt tattoo do not collide.
 * Track C — worn armor / shield (`item.category`), each capped at one equipped.
 * Track D — hands available vs. hands consumed by equipped weapons/held items.
 *
 * `equipSlot`/`tattooSlot` are free strings (never rejected) — an unrecognized slot string is still
 * grouped and warned on, labeled via `EQUIP_SLOT_LABELS[slot] ?? titleCase(slot)` rather than being
 * dropped from view.
 */

export type EquipmentSlotOccupant = { id: string; name: string; quantity: number };

export type EquipmentSlotsSummary = {
  /** Track A: equipped items grouped by `equipSlot` (unset slot → not tracked here at all). */
  bySlot: Record<string, EquipmentSlotOccupant[]>;
  /** Track B: equipped items grouped by `tattooSlot` — independent of `bySlot`. */
  tattoosBySlot: Record<string, EquipmentSlotOccupant[]>;
  /** Track D: equipped items that consume a hand (weapon or `heldSlot`), with the hands each uses. */
  held: Array<{ id: string; name: string; hands: number }>;
  handsUsed: number;
  handsAvailable: number;
  /** Track C counts (equipped `category === "armor"` / `"shield"`). */
  armorCount: number;
  shieldCount: number;
  warnings: string[];
};

/** "belt_of_giants" / "belt of giants" → "Belt Of Giants" — the fallback label for a homebrew slot
 * string not present in EQUIP_SLOT_LABELS (never silently dropped from the doll/list). */
function titleCase(raw: string): string {
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function slotLabel(slot: string): string {
  return EQUIP_SLOT_LABELS[slot] ?? titleCase(slot);
}

/** Hands consumed by a weapon grip: two-handed = 2, everything else (one/off/light) = 1. */
function handsForWeaponGrip(handed: string): number {
  return handed === "two" ? 2 : 1;
}

export function computeEquipmentSlots(character: PathForgeCharacterV1): EquipmentSlotsSummary {
  const equipped = allInventory(character).filter((item) => item.equipped === true);
  const warnings: string[] = [];

  // Occupancy counts are QUANTITY-AWARE (review finding): one row with quantity 2 marked equipped
  // ("found a second identical ring, bumped the count") is two physical occupants of that slot —
  // the same collision that would warn as two separate rows must warn here too.
  const qty = (item: { quantity?: number }) => Math.max(1, Math.round(item.quantity ?? 1));
  const occupantCount = (occupants: EquipmentSlotOccupant[]) =>
    occupants.reduce((sum, o) => sum + o.quantity, 0);

  // Track A — wondrous body slots.
  const bySlot: Record<string, EquipmentSlotOccupant[]> = {};
  for (const item of equipped) {
    const slot = item.equipSlot?.trim();
    if (!slot) continue;
    (bySlot[slot] ??= []).push({ id: item.id, name: item.name, quantity: qty(item) });
  }
  for (const [slot, occupants] of Object.entries(bySlot)) {
    const count = occupantCount(occupants);
    if (count > 1) {
      warnings.push(
        `${slotLabel(slot)}: ${count} items equipped (${occupants.map((o) => o.name).join(", ")})`,
      );
    }
  }

  // Track B — tattoo sub-slots, independent of Track A (a body-slot item and a tattoo in the same
  // region legitimately coexist — no cross-track warning).
  const tattoosBySlot: Record<string, EquipmentSlotOccupant[]> = {};
  for (const item of equipped) {
    const slot = item.tattooSlot?.trim();
    if (!slot) continue;
    (tattoosBySlot[slot] ??= []).push({ id: item.id, name: item.name, quantity: qty(item) });
  }
  for (const [slot, occupants] of Object.entries(tattoosBySlot)) {
    const count = occupantCount(occupants);
    if (count > 1) {
      warnings.push(
        `${slotLabel(slot)} tattoo: ${count} tattoos equipped (${occupants.map((o) => o.name).join(", ")})`,
      );
    }
  }

  // Track C — worn armor / shield. The AC math already self-corrects (typed stacking keeps only the
  // highest armor/shield bonus), so this is purely a visibility warning that a second suit is dead
  // weight, not a math fix.
  const armorItems = equipped.filter((item) => item.category === "armor");
  const shieldItems = equipped.filter((item) => item.category === "shield");
  if (armorItems.length > 1) {
    warnings.push(`Armor: ${armorItems.length} items equipped (${armorItems.map((i) => i.name).join(", ")})`);
  }
  if (shieldItems.length > 1) {
    warnings.push(`Shield: ${shieldItems.length} items equipped (${shieldItems.map((i) => i.name).join(", ")})`);
  }

  // Track D — hands. A weapon block's `handed` encodes a weapon's hand cost; `heldSlot` covers
  // non-weapon held items (staves/rods/held wands); an equipped SHIELD occupies a hand per RAW
  // (the plan's Track D spec — a greatsword + heavy shield must warn). The one RAW exception is
  // the buckler (strapped to the forearm, hand stays free) — detected by NAME as a documented
  // heuristic; a false miss is only a missed warn-only hint, never a math error.
  const handsAvailable = character.inventory.settings?.handsAvailable ?? 2;
  const held: Array<{ id: string; name: string; hands: number }> = [];
  for (const item of equipped) {
    let hands = 0;
    if (item.weapon) {
      hands = handsForWeaponGrip(item.weapon.handed);
    } else if (item.heldSlot) {
      hands = item.heldSlot === "two_hand" ? 2 : 1;
    } else if (item.category === "shield" && !/buckler/i.test(item.name)) {
      hands = 1;
    }
    if (hands > 0) held.push({ id: item.id, name: item.name, hands });
  }
  const handsUsed = held.reduce((sum, h) => sum + h.hands, 0);
  if (handsUsed > handsAvailable) {
    warnings.push(
      `Hands: ${handsUsed} used exceeds ${handsAvailable} available (${held.map((h) => h.name).join(", ")})`,
    );
  }

  return {
    bySlot,
    tattoosBySlot,
    held,
    handsUsed,
    handsAvailable,
    armorCount: armorItems.length,
    shieldCount: shieldItems.length,
    warnings,
  };
}
