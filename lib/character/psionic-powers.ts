/**
 * Pure helpers for the psionic power picker + read view (3PP Phase 3A — docs/3PP_MASTER_PLAN.md).
 * Kept in a lib file (no React, no Supabase) so the matching/parsing rules are unit-testable.
 *
 * Data shape notes (prod): `psionic_power_class_level` is a junction of
 * { power, class, level } where `class` holds COMPOUND values like "Psion/Wilder" and `level`
 * is text; `psionic_power_compendium.power_points` is text ("1", "3 (see text)", …) and rich-text
 * cells use literal "<br>" separators.
 */

/** Normalize one class name for matching: strip archetype parens, collapse spaces, lowercase. */
function normalizeClassSegment(s: string): string {
  return s
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Does a junction `class` value cover the character's manifester class? The junction stores
 * compound values ("Psion/Wilder"), so both sides split on "/" and compare segments
 * case-insensitively with archetype parens stripped — "Psion" hits "Psion/Wilder", and
 * "Psychic Warrior (Meditant)" hits "Psychic Warrior". A junction segment of "All" (the data's
 * "every manifester gets this" marker, 13 prod rows) matches any non-empty class name.
 */
export function matchesManifesterClass(junctionClass: string, className: string): boolean {
  const mine = new Set(className.split("/").map(normalizeClassSegment).filter(Boolean));
  if (mine.size === 0) return false;
  return junctionClass
    .split("/")
    .map(normalizeClassSegment)
    .some((seg) => seg === "all" || (seg !== "" && mine.has(seg)));
}

/**
 * Extract a BARE-integer `power_points` cost ("1" → 1, "  7 " → 7). Anything beyond whitespace
 * after the number → undefined: prod rows carry per-class variants ("3 (dread), 5 (psion/wilder)",
 * "13 telepath and tactician, 11 dread", "3, telepath 1") where the leading integer is the WRONG
 * cost for other classes, plus conditional shapes ("Psionic focus or 1", "5/round"). Those stay
 * visible as raw text in the detail view; `ppCost` is left unset rather than guessing.
 */
export function extractPpCost(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = /^\s*(\d+)\s*$/.exec(text);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

/** Junction `level` is text — parse the first integer, clamped to the 0–9 power-level range. */
export function parseJunctionLevel(text: string | null | undefined): number | undefined {
  if (text == null) return undefined;
  const m = /(\d+)/.exec(text);
  if (!m) return undefined;
  return Math.max(0, Math.min(9, Number.parseInt(m[1]!, 10)));
}

/** Split a compendium discipline cell on "<br>" compounds into clean parts. */
export function disciplineParts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The base discipline of a part — "Telepathy (Charm) [Mind-Affecting]" → "Telepathy". */
export function baseDiscipline(part: string): string {
  return (part.split(/[([]/)[0] ?? "").trim();
}

/** Literal "<br>"-separated rich text → plain newline text (for caching + display). */
export function brToNewlines(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const out = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out || undefined;
}

/** Group a powers list by level (ascending), each group sorted by name — the read-view shape. */
export function groupPowersByLevel<T extends { level: number; name: string }>(
  powers: T[],
): Array<{ level: number; powers: T[] }> {
  const by = new Map<number, T[]>();
  for (const p of powers) {
    const lvl = Number.isFinite(p.level) ? p.level : 0;
    const list = by.get(lvl);
    if (list) list.push(p);
    else by.set(lvl, [p]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, list]) => ({ level, powers: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}
