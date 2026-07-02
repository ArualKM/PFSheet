import type { CompanionMasterCache, PathForgeCharacterV1, AttackEntry, ModifierEntry } from "@pathforge/schema";
import type { ComputedCharacter } from "@pathforge/rules-pf1e";

/**
 * Master→companion sync + compendium statblock parsing. Pure helpers — the server actions
 * (createCompanionAction / saveCharacterSheetAction / the companion edit-page load) do the IO.
 */

function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** The denormalized master stats a linked companion's engine rules read (familiar basics). */
export function buildMasterCache(
  masterId: string,
  master: PathForgeCharacterV1,
  computed: ComputedCharacter,
): CompanionMasterCache {
  const skillRanks: Record<string, number> = {};
  for (const s of master.skills.list) {
    const total = (s.ranks ?? 0) + (s.backgroundRanks ?? 0);
    if (total > 0) skillRanks[s.key] = total;
  }
  return {
    characterId: masterId,
    name: master.identity.name,
    level: master.identity.totalLevel ?? 0,
    bab: toInt(master.combat.bab.total),
    // "half the master's total hit points (not including temporary hit points)" — the computed
    // max already includes automation bonuses and excludes temp.
    hpMax: computed.summary.hp.max,
    saves: {
      fortitude: toInt(master.defenses.savingThrows.fortitude.base),
      reflex: toInt(master.defenses.savingThrows.reflex.base),
      will: toInt(master.defenses.savingThrows.will.base),
    },
    skillRanks,
    syncedAt: new Date().toISOString(),
  };
}

/** Two caches are equivalent when everything except the sync timestamp matches. skillRanks keys
 * are sorted before comparing — Postgres jsonb re-orders record keys on the round-trip, so a
 * naive stringify would report "changed" on every compare for any master with 2+ ranked skills
 * (and every master save would rewrite every companion row). */
export function masterCacheEquals(a: CompanionMasterCache | undefined, b: CompanionMasterCache): boolean {
  if (!a) return false;
  const strip = (c: CompanionMasterCache) => ({
    ...c,
    syncedAt: undefined,
    skillRanks: Object.fromEntries(Object.entries(c.skillRanks ?? {}).sort(([x], [y]) => x.localeCompare(y))),
  });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/* ------------------------------------------------------------------------- */
/* Compendium statblock parsing (animal_companion_compendium row → sheet)     */
/* ------------------------------------------------------------------------- */

const SIZES = ["fine", "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"];

/** "Str 11, Dex 18, Con 9, Int 2, Wis 13, Cha 10" → ability scores. */
export function parseAbilityScores(text: string | null | undefined): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const m of String(text ?? "").matchAll(/\b(str|dex|con|int|wis|cha)\s*(\d+)/gi)) {
    out[m[1]!.toLowerCase()] = Number.parseInt(m[2]!, 10);
  }
  return out;
}

/** "+3 natural armor" → 3 (0 when absent). */
export function parseNaturalArmor(text: string | null | undefined): number {
  const m = String(text ?? "").match(/([+-]?\d+)\s*natural/i);
  return m ? Number.parseInt(m[1]!, 10) : 0;
}

/** "bite (1d6 plus trip), 2 claws (1d3)" → attack rows. */
export function parseAttacks(text: string | null | undefined): { name: string; damage: string }[] {
  const out: { name: string; damage: string }[] = [];
  for (const part of String(text ?? "").split(/[,;]/)) {
    const m = part.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) out.push({ name: m[1]!.trim(), damage: m[2]!.trim() });
  }
  return out;
}

/** "Medium" / "Size Medium; Speed 30 ft." → a canonical size key (default medium). */
export function parseSize(text: string | null | undefined): string {
  const t = String(text ?? "").toLowerCase();
  return SIZES.find((s) => t.includes(s)) ?? "medium";
}

export type CompanionStatblockRow = {
  slug: string;
  name: string;
  size?: string | null;
  speed?: string | null;
  ac?: string | null;
  attack?: string | null;
  ability_scores?: string | null;
  special_qualities?: string | null;
  starting_stats?: string | null;
  advancement?: string | null;
  /** familiar_compendium: the benefit the MASTER gains. */
  granted_ability?: string | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Autofill a freshly-created companion sheet from a compendium statblock row (mutates the sheet).
 * Never discards source text: the full starting statistics + advancement prose are preserved as
 * features so nothing the compendium said is lost.
 */
export function applyCompanionStatblock(sheet: PathForgeCharacterV1, row: CompanionStatblockRow): void {
  const scores = parseAbilityScores(row.ability_scores ?? row.starting_stats);
  for (const [key, score] of Object.entries(scores)) {
    const slot = sheet.abilities.primary[key as keyof typeof sheet.abilities.primary];
    if (slot && typeof score === "number") slot.score = score;
  }

  sheet.identity.size = parseSize(row.size ?? row.starting_stats);
  if (row.speed) sheet.combat.speed.base = row.speed;

  const na = parseNaturalArmor(row.ac ?? row.starting_stats);
  if (na !== 0) {
    const mod: ModifierEntry = {
      id: "ac_natural",
      label: "Natural armor",
      value: na,
      bonusType: "natural_armor",
      enabled: true,
    };
    sheet.defenses.armorClass.conditionalModifiers = [
      ...sheet.defenses.armorClass.conditionalModifiers.filter((m) => m.id !== "ac_natural"),
      mod,
    ];
  }

  for (const atk of parseAttacks(row.attack ?? "")) {
    const entry: AttackEntry = {
      id: newId("atk"),
      name: atk.name,
      attackType: "natural",
      damageFormula: atk.damage,
      enabled: true,
      conditionalModifiers: [],
      showInCombat: true,
    };
    sheet.combat.attacks.push(entry);
  }

  const featureTexts: { name: string; description: string }[] = [];
  if (row.special_qualities) featureTexts.push({ name: "Special qualities", description: row.special_qualities });
  if (row.starting_stats) featureTexts.push({ name: "Starting statistics", description: row.starting_stats });
  if (row.advancement) featureTexts.push({ name: "Advancement", description: row.advancement });
  // The attack parse is best-effort (nested parens / odd clauses can slip past it) — keep the
  // source text so nothing is silently discarded ("import never silently discards data").
  if (row.attack) featureTexts.push({ name: "Attacks (source)", description: row.attack });
  if (row.granted_ability) featureTexts.push({ name: "Master benefit", description: row.granted_ability });
  for (const f of featureTexts) {
    sheet.features.list.push({
      id: newId("feat"),
      name: f.name,
      category: "racial_trait",
      description: f.description,
      automation: [],
    });
  }
}
