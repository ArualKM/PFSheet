import { KNOWN_CHAKRA_SLOTS, parseVeilSlots } from "@pathforge/schema";

/**
 * Pure helpers for the Akashic veil picker + shaped-loadout UI (3PP Phase 5 —
 * docs/3PP_MASTER_PLAN.md). No React, no Supabase, so the ranking and slot-option derivation are
 * unit-testable (the path-of-war-presets pattern).
 */

export type VeilSearchRow = {
  name: string | null;
  slot?: string | null;
  descriptors?: string | null;
  effect?: string | null;
  bind_effect?: string | null;
};

/**
 * Client-side hierarchical ranking (the maneuver-picker pattern): exact name → name starts-with →
 * name contains → slot/descriptor/rules-text contains; non-matches drop. Searching the
 * already-loaded table keeps the structural filters complete — a truncated server page would hide
 * matching veils from the slot/class-list filters.
 */
export function rankVeils<T extends VeilSearchRow>(rows: T[], term: string): T[] {
  const q = term.trim().toLowerCase();
  if (!q) return rows;
  const tier = (r: T): number => {
    const n = (r.name ?? "").toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    const text = [r.slot, r.descriptors, r.effect, r.bind_effect].filter(Boolean).join("\n").toLowerCase();
    return text.includes(q) ? 3 : 99;
  };
  return rows
    .map((r) => ({ r, t: tier(r) }))
    .filter((x) => x.t < 99)
    .sort((a, b) => a.t - b.t || (a.r.name ?? "").localeCompare(b.r.name ?? ""))
    .map((x) => x.r);
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Distinct SINGLE slots across the compendium's comma-multi slot cells: the canonical chakra slots
 * first (body order), then the nonstandard leftovers ("Storm", "see text", …) alphabetically.
 * Dedup is case-insensitive and the first-seen casing wins ("Hands" stays "Hands").
 */
export function veilSlotOptions(slotCells: Array<string | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const cell of slotCells) {
    for (const slot of parseVeilSlots(cell)) {
      const key = norm(slot);
      if (!seen.has(key)) seen.set(key, slot);
    }
  }
  const known: string[] = [];
  for (const k of KNOWN_CHAKRA_SLOTS) {
    const hit = seen.get(k);
    if (hit !== undefined) {
      known.push(hit);
      seen.delete(k);
    }
  }
  return [...known, ...[...seen.values()].sort((a, b) => a.localeCompare(b))];
}

/**
 * Whether a veil may occupy a slot. No chosen slot OR no cached veil slots both mean "anything
 * goes" — the filter trims, it never hides a veil whose slot data is missing (the maneuver-picker
 * unparseable-level rule).
 */
export function veilMatchesSlot(veilSlots: string[], slot: string): boolean {
  const s = norm(slot ?? "");
  if (!s) return true;
  if (veilSlots.length === 0) return true;
  return veilSlots.some((v) => norm(v) === s);
}
