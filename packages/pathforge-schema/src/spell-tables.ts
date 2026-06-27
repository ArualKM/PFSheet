/**
 * §6.10 Spells-per-day tables + bonus-spell math (mechanics only, SRD-derived — like
 * buff-templates.ts / class-catalog.ts). These seed a caster's `spellsPerDayTable`
 * (stored on the sheet) so the engine can derive per-level slots instead of the user
 * hand-typing them. Keyed `classLevel (1..20) → { spellLevel "0".."9": baseSlots }`,
 * listing only non-zero entries.
 */
export type SpellsPerDayTable = Record<string, Record<string, number>>;

/** Standard PF1e bonus spells from a high casting-ability modifier (no bonus at level 0). */
export function bonusSpellsForLevel(abilityMod: number, spellLevel: number): number {
  if (spellLevel < 1) return 0;
  if (abilityMod < spellLevel) return 0;
  return Math.floor((abilityMod - spellLevel) / 4) + 1;
}

// Cleric / Druid / Wizard share the same base full-prepared progression.
const FULL_PREPARED: SpellsPerDayTable = {
  "1": { "0": 3, "1": 1 },
  "2": { "0": 4, "1": 2 },
  "3": { "0": 4, "1": 2, "2": 1 },
  "4": { "0": 4, "1": 3, "2": 2 },
  "5": { "0": 4, "1": 3, "2": 2, "3": 1 },
  "6": { "0": 4, "1": 3, "2": 3, "3": 2 },
  "7": { "0": 4, "1": 4, "2": 3, "3": 2, "4": 1 },
  "8": { "0": 4, "1": 4, "2": 3, "3": 3, "4": 2 },
  "9": { "0": 4, "1": 4, "2": 4, "3": 3, "4": 2, "5": 1 },
  "10": { "0": 4, "1": 4, "2": 4, "3": 3, "4": 3, "5": 2 },
  "11": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 3, "5": 2, "6": 1 },
  "12": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 3, "5": 3, "6": 2 },
  "13": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 3, "6": 2, "7": 1 },
  "14": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 3, "6": 3, "7": 2 },
  "15": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": 3, "7": 2, "8": 1 },
  "16": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": 3, "7": 3, "8": 2 },
  "17": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": 4, "7": 3, "8": 2, "9": 1 },
  "18": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": 4, "7": 3, "8": 3, "9": 2 },
  "19": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": 4, "7": 4, "8": 3, "9": 3 },
  "20": { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": 4, "7": 4, "8": 4, "9": 4 },
};

const SORCERER: SpellsPerDayTable = {
  "1": { "0": 5, "1": 3 },
  "2": { "0": 6, "1": 4 },
  "3": { "0": 6, "1": 5 },
  "4": { "0": 6, "1": 6, "2": 3 },
  "5": { "0": 6, "1": 6, "2": 4 },
  "6": { "0": 6, "1": 6, "2": 5, "3": 3 },
  "7": { "0": 6, "1": 6, "2": 6, "3": 4 },
  "8": { "0": 6, "1": 6, "2": 6, "3": 5, "4": 3 },
  "9": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 4 },
  "10": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 5, "5": 3 },
  "11": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 4 },
  "12": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 5, "6": 3 },
  "13": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 4 },
  "14": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 5, "7": 3 },
  "15": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 6, "7": 4 },
  "16": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 6, "7": 5, "8": 3 },
  "17": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 6, "7": 6, "8": 4 },
  "18": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 6, "7": 6, "8": 5, "9": 3 },
  "19": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 6, "7": 6, "8": 6, "9": 4 },
  "20": { "0": 6, "1": 6, "2": 6, "3": 6, "4": 6, "5": 6, "6": 6, "7": 6, "8": 6, "9": 6 },
};

/**
 * Per-class base spells/day, keyed by the CLASS_CATALOG preset key. Classes without
 * a verified table here (Bard, Paladin, Ranger, …) fall back to the manual slot grid
 * (autoSlots stays false) until their progression is added and verified.
 */
export const SPELLS_PER_DAY_TABLES: Record<string, SpellsPerDayTable> = {
  wizard: FULL_PREPARED,
  cleric: FULL_PREPARED,
  druid: FULL_PREPARED,
  sorcerer: SORCERER,
};

/** The base spells/day table for a class preset key, if one ships (else manual slots). */
export function spellsPerDayTableFor(presetKey: string | undefined): SpellsPerDayTable | undefined {
  return presetKey ? SPELLS_PER_DAY_TABLES[presetKey] : undefined;
}
