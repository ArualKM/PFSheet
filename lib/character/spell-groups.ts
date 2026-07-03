/**
 * Pure helpers for grouping spell lists by level — mirrors `groupPowersByLevel`
 * (lib/character/psionic-powers.ts) so the read view and the editor collapse long
 * spell lists into per-level accordion sections the same way. No React, no Supabase.
 */

/** Group a spells list by level (ascending), each group sorted by name — the list-surface shape. */
export function groupSpellsByLevel<T extends { level: number; name: string }>(
  spells: T[],
): Array<{ level: number; spells: T[] }> {
  const by = new Map<number, T[]>();
  for (const s of spells) {
    const lvl = Number.isFinite(s.level) ? s.level : 0;
    const list = by.get(lvl);
    if (list) list.push(s);
    else by.set(lvl, [s]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, list]) => ({ level, spells: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}

/** Human label for a spell level group — level 0 is "Cantrips", otherwise "Level N". */
export function spellLevelLabel(level: number): string {
  return level <= 0 ? "Cantrips" : `Level ${level}`;
}
