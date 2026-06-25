import type { PathForgeCharacterV1 } from "./character";
import type { RulesBlock } from "./rules";

/**
 * Catalog of optional rulesets and third-party (3pp) systems a character can
 * enable (§18). Toggling a module persists to the character's `rules`:
 *  - modules with a `variantKey` write the typed flag on `rules.variants`;
 *  - the rest add/remove an entry in `rules.modules[]`.
 *
 * Pass 2 wires the toggles + storage; each module's sheet fields/calculations
 * are layered in as the module ships (it reads `isRuleEnabled` to reveal them).
 */
export type RuleModuleGroup = "paizo" | "subsystem" | "thirdparty";

export type OptionalRuleModule = {
  key: string;
  name: string;
  description: string;
  group: RuleModuleGroup;
  publisher?: string;
  /** When set, stored on `rules.variants[variantKey]`; otherwise in `rules.modules[]`. */
  variantKey?: keyof RulesBlock["variants"];
};

export const OPTIONAL_RULE_MODULES: OptionalRuleModule[] = [
  // ── Paizo optional rules ────────────────────────────────────────────────
  {
    key: "mythic",
    name: "Mythic Adventures",
    group: "paizo",
    variantKey: "mythic",
    description:
      "Mythic tiers, paths, mythic power and surge, hard to kill, and mythic feats/abilities layered on top of normal advancement.",
  },
  {
    key: "background_skills",
    name: "Background Skills",
    group: "paizo",
    variantKey: "backgroundSkills",
    description: "Extra background skill ranks each level, tracked separately from adventuring skills.",
  },
  {
    key: "wounds_vigor",
    name: "Wounds & Vigor",
    group: "paizo",
    variantKey: "woundsVigor",
    description: "Replace hit points with a vigor pool plus a wound threshold for lethal damage.",
  },
  {
    key: "abp",
    name: "Automatic Bonus Progression",
    group: "paizo",
    variantKey: "automaticBonusProgression",
    description: "Grant the “big six” enhancement bonuses automatically by level instead of from magic items.",
  },
  {
    key: "fractional",
    name: "Fractional Base Bonuses",
    group: "paizo",
    variantKey: "fractionalBabSaves",
    description: "Compute BAB and saves as fractions across multiclass levels for smoother totals.",
  },
  {
    key: "words_of_power",
    name: "Words of Power",
    group: "paizo",
    description: "Alternative spellcasting that assembles spells from word effects and target words.",
  },
  // ── Subsystems & tracking ───────────────────────────────────────────────
  {
    key: "hero_points",
    name: "Hero Points",
    group: "subsystem",
    description: "A pool of hero points spent for bonuses, rerolls, extra actions, or cheating death.",
  },
  {
    key: "sanity",
    name: "Sanity",
    group: "subsystem",
    description: "Sanity score, edge, threshold, and madnesses for horror campaigns.",
  },
  {
    key: "fame_prestige",
    name: "Fame & Prestige",
    group: "subsystem",
    description: "Downtime fame and prestige points for organizations, contacts, and special perks.",
  },
  {
    key: "kineticist_burn",
    name: "Kineticist Burn",
    group: "subsystem",
    description: "Burn, accepted burn, and burn-based limits for kineticists.",
  },
  // ── Third-party content ─────────────────────────────────────────────────
  {
    key: "psionics",
    name: "Psionics",
    group: "thirdparty",
    publisher: "Dreamscarred Press",
    description: "Power points, psionic powers, disciplines, and psionic classes.",
  },
  {
    key: "spheres_of_power",
    name: "Spheres of Power",
    group: "thirdparty",
    publisher: "Drop Dead Studios",
    description: "Modular magic: caster level, spell points, and magic spheres/talents.",
  },
  {
    key: "spheres_of_might",
    name: "Spheres of Might",
    group: "thirdparty",
    publisher: "Drop Dead Studios",
    description: "Martial spheres and talents for practitioners and combat styles.",
  },
  {
    key: "spheres_of_guile",
    name: "Spheres of Guile",
    group: "thirdparty",
    publisher: "Drop Dead Studios",
    description: "Skill-based spheres and talents for social and exploration play.",
  },
  {
    key: "path_of_war",
    name: "Path of War",
    group: "thirdparty",
    publisher: "Dreamscarred Press",
    description: "Martial disciplines, maneuvers, stances, and initiator levels.",
  },
  {
    key: "akashic",
    name: "Akashic Magic",
    group: "thirdparty",
    publisher: "Dreamscarred Press",
    description: "Veils, essence investment, and akashic binds/chakras.",
  },
  {
    key: "elephant",
    name: "Elephant in the Room (feat tax)",
    group: "thirdparty",
    variantKey: "elephantInTheRoom",
    description: "Streamlines feat chains by folding common “feat taxes” into baseline combat options.",
  },
];

/** Whether a character has the given optional rule module enabled. */
export function isRuleEnabled(character: PathForgeCharacterV1, mod: OptionalRuleModule): boolean {
  if (mod.variantKey) return character.rules.variants[mod.variantKey] === true;
  return character.rules.modules.some((m) => m.key === mod.key && m.enabled !== false);
}

/** Whether a module key is enabled (convenience for sub-editors revealing fields). */
export function isModuleKeyEnabled(character: PathForgeCharacterV1, key: string): boolean {
  const mod = OPTIONAL_RULE_MODULES.find((m) => m.key === key);
  return mod ? isRuleEnabled(character, mod) : false;
}
