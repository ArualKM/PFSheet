import { z } from "zod";
import { FAMILIAR_ARCHETYPES } from "./familiar-archetypes";

/**
 * Companion linkage — present on a character that is itself a companion (animal companion,
 * familiar, eidolon, …) of another character. The DB stores the structural link
 * (characters.parent_character_id / companion_type); this block carries the RULES side:
 * which compendium creature it was built from, the familiar archetype, and a denormalized
 * cache of the master's stats so the engine can apply the master-linked rules (familiar
 * HP = half master's, BAB = master's, saves better-of, …) without cross-character reads
 * at compute time. The cache is refreshed server-side when the master saves and when the
 * companion sheet loads.
 */

export const COMPANION_TYPES = [
  "animal_companion",
  "familiar",
  "eidolon",
  "cohort",
  "mount",
  "other",
] as const;
export type CompanionType = (typeof COMPANION_TYPES)[number];

export const companionMasterCacheSchema = z.object({
  characterId: z.string().optional(),
  name: z.string().optional(),
  /** Master character level (drives the familiar advancement table). */
  level: z.number().int().default(0),
  /** Master base attack bonus (familiars use it outright). */
  bab: z.number().int().default(0),
  /** Master max hp WITHOUT temporary hp (familiar hp = half, rounded down). */
  hpMax: z.number().int().default(0),
  /** Master BASE save bonuses (familiars use the better of their own base or the master's). */
  saves: z
    .object({
      fortitude: z.number().int().default(0),
      reflex: z.number().int().default(0),
      will: z.number().int().default(0),
    })
    .default({ fortitude: 0, reflex: 0, will: 0 }),
  /** Master skill ranks by canonical skill key (familiars use the better ranks per skill). */
  skillRanks: z.record(z.string(), z.number()).default({}),
  /** ISO timestamp of the last sync (display only). */
  syncedAt: z.string().optional(),
});
export type CompanionMasterCache = z.infer<typeof companionMasterCacheSchema>;

/** A single mechanical benefit a familiar grants its MASTER, expressed as an engine modifier target
 * (`skill.stealth`, `save.reflex`, `init`, `hp`, …) + a value. `note` carries any RAW condition
 * ("in bright light", "if within 1 mile") so the master's card can show the caveat. */
export const masterBenefitEffectSchema = z.object({
  target: z.string(),
  value: z.number(),
  note: z.string().optional(),
});
export type MasterBenefitEffect = z.infer<typeof masterBenefitEffectSchema>;

/** The parsed master-facing benefit of a familiar (from familiar_compendium.granted_ability), stored
 * on the familiar's own companion block. `rawText` preserves the source prose ("never discards data"). */
export const companionMasterBenefitSchema = z.object({
  effects: z.array(masterBenefitEffectSchema).default([]),
  rawText: z.string().optional(),
});
export type CompanionMasterBenefit = z.infer<typeof companionMasterBenefitSchema>;

export const companionBlockSchema = z.object({
  type: z.enum(COMPANION_TYPES).optional(),
  /** Compendium slug this companion was autofilled from (animal_companion/familiar compendium). */
  compendiumId: z.string().optional(),
  /** Familiar archetype name (Mauler, Sage, …) — swaps some standard granted abilities. */
  archetype: z.string().optional(),
  /** Apply the master-linked rules in the engine (familiars only for now). */
  syncEnabled: z.boolean().optional(),
  master: companionMasterCacheSchema.optional(),
  /** The benefit THIS familiar grants its master (Alertness is handled separately + universally).
   * Denormalized from the compendium at create so the reverse familiar→master sync needs no re-query. */
  masterBenefit: companionMasterBenefitSchema.optional(),
});
export type CompanionBlock = z.infer<typeof companionBlockSchema>;

/** Denormalized cache, stored on a MASTER's sheet, of one linked familiar's benefit to the master.
 * The reverse of {@link companionMasterCacheSchema} (which caches master stats onto the familiar):
 * this lets the engine grant the master Alertness + the familiar's specific bonus with no
 * cross-character read at compute time. Rebuilt by the reverse sync on familiar create/save and
 * self-healed when the master views its sheet. */
export const familiarBenefitSchema = z.object({
  /** The familiar's character id (for the master's display link). */
  characterId: z.string().optional(),
  name: z.string().default("Familiar"),
  archetype: z.string().optional(),
  masterLevel: z.number().int().default(0),
  /** True unless the chosen archetype keeps Alertness for the familiar (Egotist/Infiltrator/…). */
  grantsAlertness: z.boolean().default(true),
  effects: z.array(masterBenefitEffectSchema).default([]),
  rawText: z.string().optional(),
  syncedAt: z.string().optional(),
});
export type FamiliarBenefit = z.infer<typeof familiarBenefitSchema>;

/** The standard familiar special-ability progression by MASTER level (Core Rulebook). */
export const FAMILIAR_GRANTED_ABILITIES: { level: number; name: string; note: string }[] = [
  { level: 1, name: "Alertness", note: "While the familiar is within arm's reach, the master gains the Alertness feat." },
  { level: 1, name: "Improved Evasion", note: "No damage on a successful Reflex save for half; half damage on a failure." },
  { level: 1, name: "Share Spells", note: "The master may cast a spell with a target of \"You\" on the familiar instead." },
  { level: 1, name: "Empathic Link", note: "Empathic communication with the master to 1 mile." },
  { level: 3, name: "Deliver Touch Spells", note: "The familiar can deliver the master's touch spells." },
  { level: 5, name: "Speak with Master", note: "Familiar and master communicate verbally in their own language." },
  { level: 7, name: "Speak with Animals of Its Kind", note: "Communicate with animals of approximately its own kind." },
  { level: 11, name: "Spell Resistance", note: "SR equal to the master's level + 5." },
  { level: 13, name: "Scry on Familiar", note: "The master may scry on the familiar once per day." },
];

/** Familiar natural-armor adjustment by master level: +1 per odd level bracket (CRB table). */
export function familiarNaturalArmor(masterLevel: number): number {
  return Math.max(0, Math.ceil(Math.min(20, masterLevel) / 2));
}

/** Familiar Intelligence score by master level: 6 at L1–2 rising to 15 at L19–20 (CRB table). */
export function familiarIntelligence(masterLevel: number): number {
  if (masterLevel <= 0) return 6;
  return Math.min(15, 5 + Math.ceil(Math.min(20, masterLevel) / 2));
}

export type FamiliarGrantedAbility = {
  level: number;
  name: string;
  note: string;
  /** True when the ability comes from the chosen archetype rather than the standard progression. */
  fromArchetype?: boolean;
};

/**
 * The familiar's granted special abilities at a master level, with the chosen archetype's swaps
 * applied. A standard ability named in ANY archetype ability's `replaces` text is removed
 * regardless of level (PF archetype semantics: a replaced ability is never gained, even before
 * its replacement comes online); the archetype's own abilities are added when the master level
 * qualifies. Matching is case-insensitive containment ("Alertness and improved evasion" removes
 * both).
 */
export function familiarGrantedAbilities(masterLevel: number, archetypeName?: string): FamiliarGrantedAbility[] {
  const archetype = archetypeName
    ? FAMILIAR_ARCHETYPES.find((a) => a.name.toLowerCase() === archetypeName.trim().toLowerCase())
    : undefined;
  const replacedText = (archetype?.abilities ?? []).map((a) => a.replaces.toLowerCase()).join(" | ");
  const standard: FamiliarGrantedAbility[] = FAMILIAR_GRANTED_ABILITIES.filter(
    (a) => masterLevel >= a.level && !replacedText.includes(a.name.toLowerCase()),
  );
  const fromArchetype: FamiliarGrantedAbility[] = (archetype?.abilities ?? [])
    .filter((a) => masterLevel >= a.masterLevel)
    .map((a) => ({ level: a.masterLevel, name: a.name, note: a.note, fromArchetype: true }));
  return [...standard, ...fromArchetype].sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));
}

/* ------------------------------------------------------------------------- */
/* Archetype numeric alters                                                    */
/* ------------------------------------------------------------------------- */

/** Structured numeric overrides for archetypes that ALTER the master-link math (not just the
 * granted-ability list). Kept beside — not inside — the generated FAMILIAR_ARCHETYPES catalog. */
export type FamiliarArchetypeAlters = {
  /** "masterLevelUncapped": Int = 5 + master level, no cap (Sage). "frozen": Int never rises (Ambassador/Mauler). */
  int?: "masterLevelUncapped" | "frozen";
  /** Natural armor advances as if the master's level were half (Sage). */
  naturalArmor?: "halfMasterLevel";
  /** HP rule replacing the standard half (Protector's Able Defender at master 11+; Figment's quarter). */
  hp?: { rule: "full" | "quarter"; minMasterLevel?: number };
  /** The archetype trades away sharing the master's skill ranks (Sage). */
  shareSkillRanks?: false;
  /** Strength increases by 1 at this master level and every 2 levels thereafter (Mauler's Increased
   * Strength) — the defining numeric of a combat familiar. */
  strengthProgressionFrom?: number;
};

export const FAMILIAR_ARCHETYPE_ALTERS: Record<string, FamiliarArchetypeAlters> = {
  Sage: { int: "masterLevelUncapped", naturalArmor: "halfMasterLevel", shareSkillRanks: false },
  Ambassador: { int: "frozen" },
  Mauler: { int: "frozen", strengthProgressionFrom: 3 },
  Protector: { hp: { rule: "full", minMasterLevel: 11 } },
  Figment: { hp: { rule: "quarter" } },
};

/** Mauler's Increased Strength bonus at a given master level: +1 at `from`, +1 per 2 levels after
 * (RAW: "at 3rd level and every 2 levels thereafter"). 0 before `from` or when the archetype has no
 * strength progression. */
export function familiarStrengthBonus(masterLevel: number, alters: FamiliarArchetypeAlters): number {
  const from = alters.strengthProgressionFrom;
  if (!from || masterLevel < from) return 0;
  return 1 + Math.floor((masterLevel - from) / 2);
}

export function familiarArchetypeAlters(archetypeName?: string): FamiliarArchetypeAlters {
  if (!archetypeName) return {};
  const key = Object.keys(FAMILIAR_ARCHETYPE_ALTERS).find(
    (n) => n.toLowerCase() === archetypeName.trim().toLowerCase(),
  );
  return key ? FAMILIAR_ARCHETYPE_ALTERS[key]! : {};
}

/** The familiar's max HP from the master's (temp-free) max, honoring archetype HP rules. */
export function familiarMaxHp(masterHpMax: number, masterLevel: number, alters: FamiliarArchetypeAlters): number {
  const hp = alters.hp;
  if (hp && masterLevel >= (hp.minMasterLevel ?? 0)) {
    if (hp.rule === "full") return masterHpMax;
    if (hp.rule === "quarter") return Math.floor(masterHpMax / 4);
  }
  return Math.floor(masterHpMax / 2);
}

/* ------------------------------------------------------------------------- */
/* Familiar base bodies                                                        */
/* ------------------------------------------------------------------------- */

/** A base animal's physical statblock. familiar_compendium ships only the master benefit (no body),
 * and there is no tiny-animal bestiary table to draw from, so the ~17 canonical familiar bodies are
 * hardcoded here so a picked familiar becomes a real creature (abilities/size/speed/attacks) instead
 * of a default all-10s Medium shell. Natural armor is intentionally omitted — the engine applies the
 * familiar's master-level natural-armor adjustment on top of any base. Int is the animal's base; the
 * engine raises it to the master-level table value. */
export type FamiliarBaseBody = {
  size: string;
  speed: string;
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  attacks: { name: string; damage: string }[];
  specialQualities?: string;
};

/** A plausible Tiny-animal body for a familiar whose slug isn't in {@link FAMILIAR_BASE_BODIES},
 * so EVERY familiar gets a real creature body rather than a default-10s Medium sheet. */
export const DEFAULT_FAMILIAR_BODY: FamiliarBaseBody = {
  size: "tiny",
  speed: "30 ft.",
  abilityScores: { str: 3, dex: 15, con: 8, int: 2, wis: 12, cha: 7 },
  attacks: [{ name: "bite", damage: "1d3" }],
};

/** Canonical familiar base bodies keyed by familiar_compendium slug (CRB + Animal Archive). */
export const FAMILIAR_BASE_BODIES: Record<string, FamiliarBaseBody> = {
  bat: { size: "tiny", speed: "5 ft., fly 40 ft. (good)", abilityScores: { str: 1, dex: 15, con: 6, int: 2, wis: 14, cha: 5 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "blindsense 20 ft." },
  cat: { size: "tiny", speed: "30 ft., climb 20 ft.", abilityScores: { str: 3, dex: 15, con: 8, int: 2, wis: 12, cha: 7 }, attacks: [{ name: "2 claws", damage: "1d2" }, { name: "bite", damage: "1d3" }], specialQualities: "low-light vision, scent" },
  "centipede-house": { size: "tiny", speed: "30 ft., climb 30 ft.", abilityScores: { str: 1, dex: 15, con: 8, int: 1, wis: 10, cha: 2 }, attacks: [{ name: "bite", damage: "1d3 plus poison" }], specialQualities: "darkvision 60 ft." },
  fox: { size: "small", speed: "40 ft.", abilityScores: { str: 9, dex: 15, con: 11, int: 2, wis: 12, cha: 6 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "low-light vision, scent" },
  goat: { size: "small", speed: "30 ft.", abilityScores: { str: 11, dex: 11, con: 12, int: 1, wis: 11, cha: 5 }, attacks: [{ name: "gore", damage: "1d3" }], specialQualities: "low-light vision" },
  hawk: { size: "tiny", speed: "10 ft., fly 60 ft. (average)", abilityScores: { str: 7, dex: 17, con: 10, int: 2, wis: 14, cha: 7 }, attacks: [{ name: "2 talons", damage: "1d4" }], specialQualities: "low-light vision" },
  lizard: { size: "tiny", speed: "20 ft., climb 20 ft.", abilityScores: { str: 3, dex: 15, con: 8, int: 1, wis: 12, cha: 2 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "low-light vision" },
  monkey: { size: "tiny", speed: "30 ft., climb 30 ft.", abilityScores: { str: 3, dex: 15, con: 10, int: 2, wis: 12, cha: 5 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "low-light vision" },
  owl: { size: "tiny", speed: "10 ft., fly 60 ft. (average)", abilityScores: { str: 4, dex: 17, con: 10, int: 2, wis: 14, cha: 4 }, attacks: [{ name: "2 talons", damage: "1d4" }], specialQualities: "low-light vision" },
  pig: { size: "small", speed: "40 ft.", abilityScores: { str: 11, dex: 13, con: 12, int: 2, wis: 13, cha: 4 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "low-light vision, scent" },
  rat: { size: "tiny", speed: "15 ft., climb 15 ft., swim 15 ft.", abilityScores: { str: 2, dex: 15, con: 11, int: 2, wis: 13, cha: 2 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "low-light vision, scent" },
  raven: { size: "tiny", speed: "10 ft., fly 40 ft. (average)", abilityScores: { str: 1, dex: 15, con: 8, int: 2, wis: 15, cha: 7 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "low-light vision" },
  "scorpion-greensting": { size: "tiny", speed: "30 ft.", abilityScores: { str: 3, dex: 16, con: 10, int: 1, wis: 10, cha: 2 }, attacks: [{ name: "sting", damage: "1d2 plus poison" }], specialQualities: "darkvision 60 ft." },
  "spider-scarlet": { size: "tiny", speed: "30 ft., climb 30 ft.", abilityScores: { str: 3, dex: 17, con: 10, int: 1, wis: 10, cha: 2 }, attacks: [{ name: "bite", damage: "1d3 plus poison" }], specialQualities: "darkvision 60 ft." },
  toad: { size: "diminutive", speed: "5 ft.", abilityScores: { str: 1, dex: 12, con: 6, int: 1, wis: 14, cha: 4 }, attacks: [], specialQualities: "low-light vision" },
  viper: { size: "tiny", speed: "20 ft., climb 20 ft., swim 20 ft.", abilityScores: { str: 4, dex: 17, con: 8, int: 1, wis: 13, cha: 2 }, attacks: [{ name: "bite", damage: "1d2 plus poison" }], specialQualities: "scent" },
  weasel: { size: "tiny", speed: "20 ft., climb 10 ft.", abilityScores: { str: 3, dex: 15, con: 10, int: 2, wis: 12, cha: 5 }, attacks: [{ name: "bite", damage: "1d3" }], specialQualities: "low-light vision, scent" },
};

/** Resolve a familiar's base body by compendium slug (falls back to a generic Tiny animal). */
export function familiarBaseBody(slug: string | null | undefined): FamiliarBaseBody {
  const key = String(slug ?? "").trim().toLowerCase();
  return FAMILIAR_BASE_BODIES[key] ?? DEFAULT_FAMILIAR_BODY;
}
