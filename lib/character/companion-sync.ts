import {
  familiarBaseBody,
  familiarGrantedAbilities,
  type CompanionMasterCache,
  type FamiliarBenefit,
  type MasterBenefitEffect,
  type PathForgeCharacterV1,
  type AttackEntry,
  type ModifierEntry,
} from "@pathforge/schema";
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

/** "Medium" / "Size Medium; Speed 30 ft." → a canonical size key, or undefined when no size token is
 * present (so the caller leaves the sheet's existing size rather than forcing "medium"). */
export function parseSize(text: string | null | undefined): string | undefined {
  const t = String(text ?? "").toLowerCase();
  return SIZES.find((s) => t.includes(s));
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

/** Id prefixes stamped on entries this file creates from a compendium statblock (attacks/features),
 * so a RE-APPLY (picking a different creature in the editor) can find + remove its own prior output
 * without touching anything the player added by hand — an unprefixed manual attack/feature can never
 * collide with these. `applyFamiliarMasterBenefit`'s "Master benefit" feature shares the same feature
 * prefix so it, too, is replaced rather than duplicated on re-pick. */
const STATBLOCK_ATTACK_ID_PREFIX = "cstat_atk_";
const STATBLOCK_FEATURE_ID_PREFIX = "cstat_feat_";

/**
 * Autofill a companion sheet from a compendium statblock row (mutates the sheet). Never discards
 * source text: the full starting statistics + advancement prose are preserved as features so nothing
 * the compendium said is lost. Idempotent-by-replacement: previously statblock-derived attacks/
 * features (tagged via the id prefixes above) are removed before the new ones are added, so calling
 * this again with a DIFFERENT row (the editor's "Change statblock" flow) swaps the creature instead of
 * stacking two statblocks' worth of attacks. At CREATE time the sheet starts empty, so this is a no-op
 * there — behavior-preserving for the existing create flow.
 */
export function applyCompanionStatblock(sheet: PathForgeCharacterV1, row: CompanionStatblockRow): void {
  const scores = parseAbilityScores(row.ability_scores ?? row.starting_stats);
  for (const [key, score] of Object.entries(scores)) {
    const slot = sheet.abilities.primary[key as keyof typeof sheet.abilities.primary];
    if (slot && typeof score === "number") slot.score = score;
  }

  const parsedSize = parseSize(row.size ?? row.starting_stats);
  if (parsedSize) sheet.identity.size = parsedSize;
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

  sheet.combat.attacks = sheet.combat.attacks.filter((a) => !a.id.startsWith(STATBLOCK_ATTACK_ID_PREFIX));
  for (const atk of parseAttacks(row.attack ?? "")) {
    const entry: AttackEntry = {
      id: newId(STATBLOCK_ATTACK_ID_PREFIX.slice(0, -1)),
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
  if (featureTexts.length > 0) {
    sheet.features.list = sheet.features.list.filter((f) => !f.id.startsWith(STATBLOCK_FEATURE_ID_PREFIX));
  }
  for (const f of featureTexts) {
    sheet.features.list.push({
      id: newId(STATBLOCK_FEATURE_ID_PREFIX.slice(0, -1)),
      name: f.name,
      category: "racial_trait",
      description: f.description,
      automation: [],
    });
  }
}

/* ------------------------------------------------------------------------- */
/* Familiar body + master-benefit (familiar → master)                          */
/* ------------------------------------------------------------------------- */

/** familiar_compendium.granted_ability trails a " | source citation" — drop it for display/parse. */
export function stripBenefitCitation(text: string | null | undefined): string {
  return String(text ?? "").split("|")[0]!.trim();
}

/** Skill label (as it appears in granted-ability prose) → canonical skill key. */
const SKILL_KEY_BY_NAME: Record<string, string> = {
  acrobatics: "acrobatics",
  appraise: "appraise",
  bluff: "bluff",
  climb: "climb",
  diplomacy: "diplomacy",
  "disable device": "disable_device",
  disguise: "disguise",
  "escape artist": "escape_artist",
  fly: "fly",
  "handle animal": "handle_animal",
  heal: "heal",
  intimidate: "intimidate",
  linguistics: "linguistics",
  perception: "perception",
  ride: "ride",
  "sense motive": "sense_motive",
  "sleight of hand": "sleight_of_hand",
  spellcraft: "spellcraft",
  stealth: "stealth",
  survival: "survival",
  swim: "swim",
  "use magic device": "use_magic_device",
};

/** A situational qualifier ("against disease", "in bright light", "if familiar is within 1 mile",
 * "(witch only)") that restricts a familiar benefit. When present, the effect is recorded for display
 * but NOT folded into the master's base total (RAW: a conditional bonus doesn't inflate the base). */
function benefitCondition(text: string): string | undefined {
  const m = text.match(
    /(against\b[^|]*|\bif\b[^|]*|\bwhen\b[^|]*|\bin (?:bright|shadow|dim|dark|daylight)[^|]*|\bwithin \d+ mile[^|]*|\([^)]*only[^)]*\))/i,
  );
  return m ? m[0]!.replace(/[()]/g, "").trim().replace(/[.,]$/, "") : undefined;
}

/**
 * Parse a familiar's `granted_ability` prose (e.g. "Master gains a +3 bonus on Stealth checks",
 * "+2 bonus on Reflex saves", "+4 bonus on initiative checks (if familiar is within 1 mile)",
 * "gains 3 hit points") into structured engine effects. Unparseable text is preserved in `rawText`
 * ("import never silently discards data").
 */
export function parseMasterBenefit(text: string | null | undefined): {
  effects: MasterBenefitEffect[];
  rawText?: string;
} {
  const benefit = stripBenefitCitation(text);
  if (!benefit) return { effects: [], rawText: undefined };
  const effects: MasterBenefitEffect[] = [];
  const note = benefitCondition(benefit);

  const skillMatch = benefit.match(/\+\s*(\d+)\s+bonus on\s+(.+?)\s+checks?/i);
  if (skillMatch) {
    const phrase = skillMatch[2]!.toLowerCase();
    for (const [name, key] of Object.entries(SKILL_KEY_BY_NAME)) {
      if (phrase.includes(name)) {
        effects.push({ target: `skill.${key}`, value: toInt(skillMatch[1]), note });
        break;
      }
    }
  }

  const saveMatch = benefit.match(/\+\s*(\d+)\s+bonus on\s+(reflex|fortitude|will)\s+saves?/i);
  if (saveMatch) effects.push({ target: `save.${saveMatch[2]!.toLowerCase()}`, value: toInt(saveMatch[1]), note });

  const initMatch = benefit.match(/\+\s*(\d+)\s+bonus on\s+initiative/i);
  if (initMatch) effects.push({ target: "init", value: toInt(initMatch[1]), note });

  // Tolerate both "gains 3 hit points" (toad) and "gains a +3 hit points" (chicken/cockroach/lamprey).
  const hpMatch = benefit.match(/gains?\s+(?:a\s+)?\+?\s*(\d+)\s+hit points?/i);
  if (hpMatch) effects.push({ target: "hp", value: toInt(hpMatch[1]), note });

  return { effects, rawText: benefit };
}

/**
 * Give a familiar sheet a real creature body from {@link familiarBaseBody} — abilities, size, speed,
 * and natural attacks (natural armor is left to the engine's master-level adjustment; Int is the
 * animal's base and the engine raises it to the master-level table). familiar_compendium ships no
 * statblock, so without this a familiar is an all-10s Medium shell. Idempotent-by-replacement like
 * {@link applyCompanionStatblock}: re-picking a different familiar swaps the body instead of piling
 * attacks/features from the old creature onto the new one; a no-op at CREATE time (empty sheet).
 */
export function applyFamiliarBaseBody(sheet: PathForgeCharacterV1, slug: string | null | undefined): void {
  const body = familiarBaseBody(slug);
  for (const [key, score] of Object.entries(body.abilityScores)) {
    const slot = sheet.abilities.primary[key as keyof typeof sheet.abilities.primary];
    if (slot) slot.score = score;
  }
  sheet.identity.size = body.size;
  sheet.combat.speed.base = body.speed;
  sheet.combat.attacks = sheet.combat.attacks.filter((a) => !a.id.startsWith(STATBLOCK_ATTACK_ID_PREFIX));
  for (const atk of body.attacks) {
    const entry: AttackEntry = {
      id: newId(STATBLOCK_ATTACK_ID_PREFIX.slice(0, -1)),
      name: atk.name,
      attackType: "natural",
      damageFormula: atk.damage,
      enabled: true,
      conditionalModifiers: [],
      showInCombat: true,
    };
    sheet.combat.attacks.push(entry);
  }
  sheet.features.list = sheet.features.list.filter(
    (f) => !(f.id.startsWith(STATBLOCK_FEATURE_ID_PREFIX) && f.name === "Special qualities"),
  );
  if (body.specialQualities) {
    sheet.features.list.push({
      id: newId(STATBLOCK_FEATURE_ID_PREFIX.slice(0, -1)),
      name: "Special qualities",
      category: "racial_trait",
      description: body.specialQualities,
      automation: [],
    });
  }
}

/**
 * Parse a familiar's `granted_ability` prose into the structured MASTER benefit and push (replacing
 * any prior one) a human-readable "Master benefit" feature. Extracted from createCompanionAction so
 * the editor's re-pick flow gets identical parsing. Only text matching "Master gains …" is a real
 * benefit — an improved familiar's `granted_ability` instead stores its alignment/caster-level
 * REQUIREMENT ("Lawful evil | 7th"), which is not a benefit, so nothing is parsed or pushed for it
 * (matches the original create-flow behavior exactly). The prior "Master benefit" feature is always
 * cleared first, even when the new row has no benefit — re-picking from a benefit-granting familiar to
 * an improved one must not leave a stale benefit on the sheet. Returns the structured effects (for
 * `companion.masterBenefit`), or undefined when the row has no parseable benefit.
 */
export function applyFamiliarMasterBenefit(
  sheet: PathForgeCharacterV1,
  grantedAbility: string | null | undefined,
): { effects: MasterBenefitEffect[]; rawText?: string } | undefined {
  sheet.features.list = sheet.features.list.filter(
    (f) => !(f.id.startsWith(STATBLOCK_FEATURE_ID_PREFIX) && f.name === "Master benefit"),
  );
  if (!grantedAbility || !/master gains/i.test(grantedAbility)) return undefined;
  const parsed = parseMasterBenefit(grantedAbility);
  sheet.features.list.push({
    id: newId(STATBLOCK_FEATURE_ID_PREFIX.slice(0, -1)),
    name: "Master benefit",
    category: "racial_trait",
    description: stripBenefitCitation(grantedAbility),
    automation: [],
  });
  return parsed.effects.length || parsed.rawText ? parsed : undefined;
}

/**
 * Build the master-facing benefit of a linked familiar (the reverse of {@link buildMasterCache}):
 * Alertness (unless the archetype keeps it) + the familiar's specific parsed bonus. Returns null for
 * a non-familiar or an unlinked familiar. Prefers the structured `companion.masterBenefit` seeded at
 * create; falls back to parsing the familiar's stored "Master benefit" feature (older sheets).
 */
export function buildFamiliarBenefit(
  familiar: PathForgeCharacterV1,
  characterId?: string,
): FamiliarBenefit | null {
  const c = familiar.companion;
  if (!c || c.type !== "familiar" || !c.syncEnabled) return null;
  const masterLevel = c.master?.level ?? familiar.identity.totalLevel ?? 0;
  const archetype = c.archetype;
  // Alertness is granted to the master unless the archetype removed standard Alertness (e.g. the
  // familiar keeps it for itself). Reuse the granted-ability computation so archetype swaps are honored.
  const grantsAlertness = familiarGrantedAbilities(masterLevel, archetype).some(
    (a) => !a.fromArchetype && a.name === "Alertness",
  );
  let effects = c.masterBenefit?.effects ?? [];
  let rawText = c.masterBenefit?.rawText;
  if (effects.length === 0 && !rawText) {
    const feat = familiar.features.list.find((f) => f.name === "Master benefit");
    // Only parse a real benefit ("Master gains …"); an improved familiar's stored alignment/
    // requirement text ("Lawful evil") is not a benefit and must not become a bogus card line.
    if (feat?.description && /master gains/i.test(feat.description)) {
      const parsed = parseMasterBenefit(feat.description);
      effects = parsed.effects;
      rawText = parsed.rawText;
    }
  }
  return {
    characterId,
    name: familiar.identity.name || "Familiar",
    archetype,
    masterLevel,
    grantsAlertness,
    effects,
    rawText,
    syncedAt: new Date().toISOString(),
  };
}

/** Two familiar-benefit lists are equivalent when everything except the sync timestamps matches —
 * used to skip no-op reverse-sync writes (mirrors {@link masterCacheEquals}). */
export function familiarBenefitsEqual(a: FamiliarBenefit[] | undefined, b: FamiliarBenefit[]): boolean {
  // Sort by characterId first — Postgres returns child rows in unstable heap order (a familiar save
  // relocates its tuple), so a positional compare would report "changed" on every view for a
  // multi-familiar master and needlessly rewrite + flip its reviews stale.
  const strip = (list: FamiliarBenefit[]) =>
    JSON.stringify(
      [...list]
        .sort((x, y) => (x.characterId ?? "").localeCompare(y.characterId ?? ""))
        .map((f) => ({ ...f, syncedAt: undefined })),
    );
  return strip(a ?? []) === strip(b);
}
