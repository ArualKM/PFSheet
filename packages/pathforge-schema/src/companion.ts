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

export const companionBlockSchema = z.object({
  type: z.enum(COMPANION_TYPES).optional(),
  /** Compendium slug this companion was autofilled from (animal_companion/familiar compendium). */
  compendiumId: z.string().optional(),
  /** Familiar archetype name (Mauler, Sage, …) — swaps some standard granted abilities. */
  archetype: z.string().optional(),
  /** Apply the master-linked rules in the engine (familiars only for now). */
  syncEnabled: z.boolean().optional(),
  master: companionMasterCacheSchema.optional(),
});
export type CompanionBlock = z.infer<typeof companionBlockSchema>;

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
};

export const FAMILIAR_ARCHETYPE_ALTERS: Record<string, FamiliarArchetypeAlters> = {
  Sage: { int: "masterLevelUncapped", naturalArmor: "halfMasterLevel", shareSkillRanks: false },
  Ambassador: { int: "frozen" },
  Mauler: { int: "frozen" },
  Protector: { hp: { rule: "full", minMasterLevel: 11 } },
  Figment: { hp: { rule: "quarter" } },
};

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
