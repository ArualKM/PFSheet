import { z } from "zod";
import {
  CHARACTER_SCHEMA_VERSION,
  pathForgeCharacterV1Schema,
  type PathForgeCharacterV1,
} from "./character";
import { ABILITY_KEYS, type AbilityKey } from "./common";
import { DEFAULT_SKILLS } from "./skills";
import { DEFAULT_FORMULAS } from "./default-formulas";
import type { AbilityScore } from "./abilities";
import type { SkillEntry } from "./skills";

const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** Simple deterministic id helper for default content (no RNG at module load). */
function slugId(prefix: string, key: string): string {
  return `${prefix}_${key}`;
}

function defaultAbilities(): Record<AbilityKey, AbilityScore> {
  const out = {} as Record<AbilityKey, AbilityScore>;
  for (const key of ABILITY_KEYS) {
    out[key] = {
      key,
      label: ABILITY_LABELS[key],
      score: 10,
      baseScore: 10,
    };
  }
  return out;
}

function defaultSkills(): SkillEntry[] {
  return DEFAULT_SKILLS.filter((s) => !s.repeatable).map((s) => ({
    id: slugId("skill", s.key),
    key: s.key,
    label: s.label,
    ability: s.ability,
    trainedOnly: s.trainedOnly,
    armorCheckPenalty: s.armorCheckPenalty,
    background: s.background,
    classSkill: false,
    ranks: 0,
    misc: [],
    conditional: [],
    formula: DEFAULT_FORMULAS.skill,
  }));
}

export type CreateCharacterOptions = {
  name?: string;
  playerName?: string;
};

/**
 * Build a valid, empty PF1e character. The result is parsed through the Zod
 * schema so it is guaranteed to satisfy {@link PathForgeCharacterV1}.
 */
export function createDefaultCharacter(options: CreateCharacterOptions = {}): PathForgeCharacterV1 {
  const name = options.name?.trim() || "New Character";

  const draft: z.input<typeof pathForgeCharacterV1Schema> = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    system: "pf1e",
    identity: {
      name,
      playerName: options.playerName,
      classes: [],
      totalLevel: 0,
    },
    profile: {
      appearance: {},
      personality: {},
      campaignJournal: [],
    },
    progression: { favoredClasses: [], levelPlan: [] },
    abilities: { primary: defaultAbilities(), custom: {} },
    health: {
      maxHp: 0,
      currentHp: 0,
      tempHp: 0,
      nonlethalDamage: 0,
      hitDice: [],
      damageReduction: [],
      energyResistance: [],
      immunities: [],
      conditions: [],
    },
    defenses: {
      armorClass: {
        formulas: { ...DEFAULT_FORMULAS.ac },
        conditionalModifiers: [],
      },
      savingThrows: {
        fortitude: { base: 0, abilityKey: "con", formula: DEFAULT_FORMULAS.saves.fortitude, conditionalModifiers: [], misc: [] },
        reflex: { base: 0, abilityKey: "dex", formula: DEFAULT_FORMULAS.saves.reflex, conditionalModifiers: [], misc: [] },
        will: { base: 0, abilityKey: "wis", formula: DEFAULT_FORMULAS.saves.will, conditionalModifiers: [], misc: [] },
      },
      defensiveItemIds: [],
      defensiveFeatureIds: [],
    },
    combat: {
      initiative: { formula: DEFAULT_FORMULAS.initiative, conditionalModifiers: [] },
      speed: { base: "30 ft" },
      bab: { total: 0, progression: "full" },
      attackBonuses: {
        melee: DEFAULT_FORMULAS.attack.melee,
        ranged: DEFAULT_FORMULAS.attack.ranged,
        cmb: DEFAULT_FORMULAS.attack.cmb,
      },
      attacks: [],
      offensiveFeatureIds: [],
    },
    skills: {
      settings: { armorCheckPenaltyApplies: true, classSkillBonusDefault: 3 },
      list: defaultSkills(),
    },
    feats: { list: [] },
    traits: { list: [] },
    features: { list: [] },
    spellcasting: {
      casters: [],
      spellbook: [],
      preparedSpells: [],
      knownSpells: [],
      spellLikeAbilities: [],
      metamagic: [],
    },
    inventory: {
      weapons: [],
      armorAndShields: [],
      potionsScrollsMagicItems: [],
      gear: [],
      otherItems: [],
      containers: [],
      encumbrance: {},
    },
    wealth: { cp: 0, sp: 0, gp: 0, pp: 0, otherCurrencies: [], valuables: [] },
    senses: { perceptionFormula: "@{skills.perception.total}", senses: [], vision: [] },
    languages: { known: ["Common"] },
    resources: { list: [] },
    buffs: { active: [], templates: [] },
    formulas: { overrides: {}, custom: [] },
    rules: {
      coreModule: "pf1e-core-default",
      modules: [],
      variants: {},
    },
    privacy: { sections: {}, defaultLevel: "private" },
    notes: {},
    metadata: { tags: [], createdWith: "pathforge", unmapped: {}, custom: {} },
  };

  // Guarantee the factory output is schema-valid (applies defaults, throws on drift).
  return pathForgeCharacterV1Schema.parse(draft);
}
