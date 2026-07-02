import type { PowManeuver, PowRecoveryMethod } from "@pathforge/schema";
import { normalizeProgression } from "./threepp-class-adapter";

/**
 * Pure helpers for the Path of War editor (3PP Phase 4 — docs/3PP_MASTER_PLAN.md). No React, no
 * Supabase, so the progression parsing + stance semantics are unit-testable.
 *
 * Data shape notes (prod, verified against every `threepp_class_compendium` PoW row):
 * - Base classes carry cumulative per-level columns "Maneuvers Known" / "Maneuvers Readied" after
 *   the canonical Level/BAB/saves/Special columns. The stances column is "Stances Known"
 *   (Harbinger/Mystic/Zealot) OR bare "Stances" (Stalker/Warder/Warlord; Stalker also has a
 *   "Dodge Bonus" column before the maneuver block).
 * - The Mystic's readied cells carry the round-start GRANTED draw in parentheses ("5 (2)").
 * - Prestige classes (Awakened Blade / Mage Hunter / Umbral Blade / Bladecaster) use bare
 *   "Known" / "Readied" / "Stances" headers whose cells are per-level GAINS ("0"/"1"/"–"), not
 *   cumulative totals.
 * Either scraper format applies (`normalizeProgression` converts the object format). Cells are
 * plain ints ("7"), dashes ("—"), or occasionally annotated ("5¹") — the leading integer is
 * authoritative, dashes mean "none".
 */

export type PowProgressionMaxes = {
  known?: number;
  readied?: number;
  /** The parenthetical granted count in a readied cell ("5 (2)") — the Mystic's separately-capped
   * round-start draw; seeds maneuversGrantedMax. */
  granted?: number;
  stances?: number;
};

/** First integer in a progression cell ("7" → 7, "5¹" → 5); dashes/blank/prose-only → undefined. */
function cellInt(cell: unknown): number | undefined {
  const m = String(cell ?? "").match(/\d+/);
  return m ? Number.parseInt(m[0]!, 10) : undefined;
}

/**
 * Read a PoW class's maneuver maxes at a class level from its `progression_json`: locates the
 * header row by its "Level" + "Maneuvers Known" cells (column order irrelevant), matches the level
 * row by its leading integer (ordinal "5th" and plain "5" cells both accepted), and parses each
 * max as the cell's leading integer. Missing columns/levels and non-numeric cells yield undefined
 * fields; anything unrecognizable yields `{}` — seeding then simply leaves the maxes unset.
 */
export function readPowProgressionMaxes(progressionJson: unknown, level: number): PowProgressionMaxes {
  const norm = normalizeProgression(progressionJson);
  const rows: unknown[][] = Array.isArray(norm) ? (norm as unknown[][]).filter(Array.isArray) : [];
  const headerIdx = rows.findIndex(
    (r) =>
      r.some((c) => /^(class\s+)?level$/i.test(String(c ?? "").trim())) &&
      r.some((c) => /^(maneuvers\s+)?known$/i.test(String(c ?? "").trim())),
  );
  if (headerIdx < 0) return {};
  const header = rows[headerIdx]!.map((c) => String(c ?? "").trim().toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const li = col(/^(class\s+)?level$/);
  const ki = col(/^(maneuvers\s+)?known$/);
  const ri = col(/^(maneuvers\s+)?readied$/);
  const si = col(/^stances?(\s+known)?$/);
  const rowLevel = (r: unknown[]): number | undefined => {
    const m = String(r[li] ?? "").trim().match(/^(\d+)(?:st|nd|rd|th)?$/i);
    return m ? Number.parseInt(m[1]!, 10) : undefined;
  };

  // Bare "Known"/"Readied"/"Stances" headers (the PoW PRESTIGE tables — Awakened Blade, Mage
  // Hunter, Umbral Blade, Bladecaster) hold per-level GAINS ("0"/"1"/"–"), not cumulative totals:
  // the max at level N is the SUM of the rows up to N. "Maneuvers …" headers (all six base
  // classes) are cumulative — read the level's own row below.
  if (ki >= 0 && !/^maneuvers\s/.test(header[ki] ?? "")) {
    let matched = false;
    const sums = { known: 0, readied: 0, stances: 0 };
    for (const r of rows.slice(headerIdx + 1)) {
      const lvl = rowLevel(r);
      if (lvl == null || lvl > level) continue;
      matched = true;
      sums.known += cellInt(r[ki]) ?? 0;
      if (ri >= 0) sums.readied += cellInt(r[ri]) ?? 0;
      if (si >= 0) sums.stances += cellInt(r[si]) ?? 0;
    }
    if (!matched) return {};
    return {
      known: sums.known,
      readied: ri >= 0 ? sums.readied : undefined,
      stances: si >= 0 ? sums.stances : undefined,
    };
  }

  for (const r of rows.slice(headerIdx + 1)) {
    if (rowLevel(r) !== level) continue;
    // The Mystic's readied cells carry the round-start GRANTED draw in parentheses ("8 (5)"):
    // the leading int stays the readied max; the parenthetical seeds maneuversGrantedMax.
    const grantedMatch = ri >= 0 ? String(r[ri] ?? "").trim().match(/^(\d+)\s*\((\d+)\)/) : null;
    return {
      known: ki >= 0 ? cellInt(r[ki]) : undefined,
      readied: ri >= 0 ? cellInt(r[ri]) : undefined,
      ...(grantedMatch ? { granted: Number.parseInt(grantedMatch[2]!, 10) } : {}),
      stances: si >= 0 ? cellInt(r[si]) : undefined,
    };
  }
  return {};
}

/**
 * The class level to seed for a named class: a matching identity.classes row wins
 * (case-insensitive, archetype parentheticals stripped) — 3pp characters are commonly multiclass,
 * and seeding from totalLevel silently inflates the derived level + the progression maxes
 * (Fighter 5/Warlord 3 must seed Warlord 3, not 8). Falls back to totalLevel only when no class
 * row matches. Shared by the PoW and Akashic editors' compendium-add flows.
 */
export function classLevelFor(
  identity: { classes: Array<{ name: string; level: number }>; totalLevel: number },
  className: string,
): number {
  const norm = (s: string) =>
    s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const target = norm(className);
  const row = target ? identity.classes.find((c) => norm(c.name) === target) : undefined;
  const lvl = row?.level ?? identity.totalLevel;
  return Math.max(1, Math.floor(lvl || 1));
}

/**
 * Sensible recovery-method default per initiating class (substring match so archetype-suffixed
 * names like "Warder (Zweihänder Sentinel)" still hit). Everything else — Zealot, Mystic,
 * Harbinger, Medic, homebrew — recovers via the generic standard action.
 */
export function powRecoveryDefault(className: string): PowRecoveryMethod {
  const n = className.trim().toLowerCase();
  if (n.includes("warlord")) return "warlord_gambit";
  if (n.includes("warder")) return "warder_defensive_focus";
  if (n.includes("stalker")) return "stalker_full_round";
  return "standard_action";
}

/**
 * ONE-active-stance enforcement (a character is ever in at most one stance): activating a stance
 * deactivates every other entry; deactivating clears only the target. The entryKind guard means a
 * non-stance id can never be flagged active (a stray `stanceActive` on a strike would otherwise
 * feed its automation into totals). Mutates in place — call inside `ed.update`.
 */
export function setActiveStance(
  maneuvers: Pick<PowManeuver, "id" | "entryKind" | "stanceActive">[],
  id: string,
  active: boolean,
): void {
  for (const m of maneuvers) {
    if (m.id === id) m.stanceActive = active && m.entryKind === "stance";
    else if (active) m.stanceActive = false;
  }
}

/** `pow_maneuver_compendium.level` is text — parse the first integer, clamped to the 1–9 range. */
export function parseManeuverLevel(text: string | null | undefined): number | undefined {
  if (text == null) return undefined;
  const m = /(\d+)/.exec(text);
  if (!m) return undefined;
  return Math.max(1, Math.min(9, Number.parseInt(m[1]!, 10)));
}

/** Group a maneuvers list by discipline (alphabetical, no-discipline "Other" last), each group
 * sorted by level then name — the read-view shape. */
export function groupManeuversByDiscipline<T extends { discipline?: string; level: number; name: string }>(
  maneuvers: T[],
): Array<{ discipline: string; maneuvers: T[] }> {
  const by = new Map<string, T[]>();
  for (const m of maneuvers) {
    const key = m.discipline?.trim() || "Other";
    const list = by.get(key);
    if (list) list.push(m);
    else by.set(key, [m]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)))
    .map(([discipline, list]) => ({
      discipline,
      maneuvers: [...list].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    }));
}
