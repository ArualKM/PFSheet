import { normalizeProgression } from "./threepp-class-adapter";

/**
 * Pure helpers for the Akashic editor (3PP Phase 5 — docs/3PP_MASTER_PLAN.md). No React, no
 * Supabase, so the progression parsing is unit-testable. `classLevelFor` is shared with the PoW
 * editor (path-of-war-presets.ts).
 *
 * Data shape notes (prod, verified against every akashic `threepp_class_compendium` row):
 * - Most classes carry cumulative per-level "Veils" + "Essence" columns after the canonical
 *   Level/BAB/saves/Special columns; a few are essence-only (Zodiac/Aghori/Astradhari/Universal
 *   Zodiac — no Veils column).
 * - Oddballs never match by accident: Volur's "Brands"/"Brand Binds", Sphereshaper Retold's
 *   "Focus Veils*", Soulforge's "Soul Veils", and Storm Warrior's "Storm Veil Capacity" all fail
 *   the anchored column regexes; only the Rajah has a bare "Binds" column — but its
 *   Level/BAB/saves/Special header tier was LOST at scrape (a known data quirk), so its rows
 *   degrade to {} rather than mis-parse.
 * - Bind unlocks mostly live in the Special column as feature names — "Chakra bind (Hands)" /
 *   "chakra bind (headband)" (case drifts; occasionally plural "Chakra binds").
 * Either scraper format applies (`normalizeProgression` converts the object format).
 */

export type AkashicProgressionMaxes = {
  essence?: number;
  veils?: number;
  binds?: number;
};

/** First integer in a progression cell ("7" → 7, "5¹" → 5); dashes/blank/prose-only → undefined.
 * SPLIT notation ("0+1", "1+2" — the Daevic/Kheshig/Pactbound Veils columns write base+bonus
 * veils as separate addends) is a TOTAL: the leading `a+b(+c…)` run is summed ("1+2" → 3). Only
 * a leading plus-chain sums — "5 (2)"/"5¹" footnote styles still read the first integer. */
function cellInt(cell: unknown): number | undefined {
  const text = String(cell ?? "");
  const split = text.match(/^\s*(\d+(?:\s*\+\s*\d+)+)/);
  if (split) {
    return split[1]!
      .match(/\d+/g)!
      .reduce((sum, n) => sum + Number.parseInt(n, 10), 0);
  }
  const m = text.match(/\d+/);
  return m ? Number.parseInt(m[0]!, 10) : undefined;
}

const trimmed = (c: unknown) => String(c ?? "").trim();

/** The level a progression row describes — ordinal "5th" and plain "5" cells both accepted. */
function rowLevel(row: unknown[], levelIdx: number): number | undefined {
  const m = trimmed(row[levelIdx]).match(/^(\d+)(?:st|nd|rd|th)?$/i);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

/** Locate the header row + the Level column index; null when the table has no Level header (the
 * Rajah's lost header tier) or `mustHave` misses — callers then degrade to empty results. */
function findHeader(
  progressionJson: unknown,
  mustHave: RegExp,
): { rows: unknown[][]; headerIdx: number; header: string[]; levelIdx: number } | null {
  const norm = normalizeProgression(progressionJson);
  const rows: unknown[][] = Array.isArray(norm) ? (norm as unknown[][]).filter(Array.isArray) : [];
  const headerIdx = rows.findIndex(
    (r) =>
      r.some((c) => /^(class\s+)?level$/i.test(trimmed(c))) &&
      r.some((c) => mustHave.test(trimmed(c))),
  );
  if (headerIdx < 0) return null;
  const header = rows[headerIdx]!.map((c) => trimmed(c).toLowerCase());
  const levelIdx = header.findIndex((h) => /^(class\s+)?level$/.test(h));
  return { rows, headerIdx, header, levelIdx };
}

/**
 * Read an akashic class's essence/veils/binds maxes at a class level from its `progression_json`:
 * locates the header row by its "Level" + "Essence" cells (column order irrelevant), matches the
 * level row by its leading integer, and parses each max as the cell's leading integer. Missing
 * columns/levels and non-numeric cells yield undefined fields; anything unrecognizable — including
 * the Rajah's lost-header table — yields `{}`, so seeding simply leaves the maxes unset.
 */
export function readAkashicProgressionMaxes(progressionJson: unknown, level: number): AkashicProgressionMaxes {
  const found = findHeader(progressionJson, /^essence$/i);
  if (!found) return {};
  const { rows, headerIdx, header, levelIdx } = found;
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const ei = col(/^essence$/);
  const vi = col(/^veils?( known| shaped)?$/);
  const bi = col(/^binds?$/);
  for (const r of rows.slice(headerIdx + 1)) {
    if (rowLevel(r, levelIdx) !== level) continue;
    return {
      essence: ei >= 0 ? cellInt(r[ei]) : undefined,
      veils: vi >= 0 ? cellInt(r[vi]) : undefined,
      binds: bi >= 0 ? cellInt(r[bi]) : undefined,
    };
  }
  return {};
}

/** The bind-unlock phrasings across the prod akashic Special columns (each pattern's group 1 is
 * the slot/tier). Verified forms:
 * - "Chakra bind (Hands)" / "chakra binds (headband)" / "Chakra Bind (Low)" — parenthesized.
 * - "Low/Middle/High/Pinnacle Chakra Bind" — tier-PREFIX with no parens (Amanuensis, Pactbound;
 *   the tier string is a nonstandard "slot" the schema tolerates by design).
 * - "Blood bind" — slot-prefix with no "chakra" (the Daevic's L12 blood-chakra unlock). The
 *   `binds?\b` tail can never match "Binding Words"/"bindings" (no word boundary mid-"binding").
 * - "ring binding" — the Vizier's L9 ring unlock (gerund, no "chakra"); "bindings" still can't
 *   match (`binding\b` fails before the trailing "s"). */
const BIND_PATTERNS: RegExp[] = [
  /chakra binds?\s*\(([^)]+)\)/gi,
  /\b(low|middle|high|pinnacle|whole)\s+chakra\s+binds?\b/gi,
  /\b(blood|hands|feet|head|headband|neck|wrists|shoulders|belt|chest|body|ring)\s+binds?\b/gi,
  /\b(ring)\s+binding\b/gi,
];

/**
 * The chakra binds a class has unlocked by a class level, read from the progression's Special
 * column — every bind-unlock feature (see BIND_PATTERNS) at levels ≤ classLevel, as an ordered
 * (by unlock level) unique lowercased slot list. Slot names stay free strings — the data carries
 * nonstandard binds ("High"/"Pinnacle" tiers) that must round-trip untouched. Unrecognizable
 * tables (incl. the Rajah's lost header) yield [].
 */
export function parseBindUnlocks(progressionJson: unknown, classLevel: number): string[] {
  const found = findHeader(progressionJson, /^(special|class features)$/i);
  if (!found) return [];
  const { rows, headerIdx, header, levelIdx } = found;
  const si = header.findIndex((h) => /^(special|class features)$/.test(h));
  const out: string[] = [];
  const seen = new Set<string>();
  const leveled = rows
    .slice(headerIdx + 1)
    .map((r) => ({ level: rowLevel(r, levelIdx), cell: trimmed(r[si]) }))
    .filter((r): r is { level: number; cell: string } => r.level != null && r.level <= classLevel)
    .sort((a, b) => a.level - b.level);
  for (const { cell } of leveled) {
    for (const re of BIND_PATTERNS) {
      for (const m of cell.matchAll(re)) {
        const slot = m[1]!.trim().toLowerCase();
        if (!slot || seen.has(slot)) continue;
        seen.add(slot);
        out.push(slot);
      }
    }
  }
  return out;
}

/**
 * The class's additive per-receptacle essence-capacity bonus at a class level, read from the
 * progression's Special column. Prod phrasings (verified): "Improved essence capacity +1/+2/+3"
 * (Vizier/Helmsman/Kheshig/Zodiac…), "Imp. Essence Capacity (+1)" (Amanuensis), and the
 * Pactbound's UNNUMBERED "Imp. Essence Cap." (L3/9/15 — each occurrence steps the bonus, so
 * unnumbered occurrences are counted). Numbered forms are absolute — the highest at levels ≤
 * classLevel wins. The Daevic's "Improved Passion Capacity" is a different (per-passion-veil)
 * feature and never matches. Unrecognizable tables yield 0.
 */
export function parseCapacityBonus(progressionJson: unknown, classLevel: number): number {
  const found = findHeader(progressionJson, /^(special|class features)$/i);
  if (!found) return 0;
  const { rows, headerIdx, header, levelIdx } = found;
  const si = header.findIndex((h) => /^(special|class features)$/.test(h));
  let best = 0;
  let unnumbered = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const level = rowLevel(r, levelIdx);
    if (level == null || level > classLevel) continue;
    for (const m of trimmed(r[si]).matchAll(
      /\bimp(?:roved|\.)?\s+essence\s+cap(?:acity|\.)?\s*(?:\(\s*\+?(\d+)\s*\)|\+?(\d+))?/gi,
    )) {
      const n = m[1] ?? m[2];
      if (n) best = Math.max(best, Number.parseInt(n, 10));
      else unnumbered += 1;
    }
  }
  return Math.max(best, unnumbered);
}
