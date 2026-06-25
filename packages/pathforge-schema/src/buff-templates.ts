import type { BonusType, DurationSpec } from "./common";
import type { BuffCategory, BuffTemplate } from "./buffs";

/**
 * A starter library of common Pathfinder 1e buffs, conditions, and class
 * features for the Buff Center (§9). Mechanics only — each effect targets a
 * path the rules engine understands (see `classifyTarget` in
 * `@pathforge/rules-pf1e`). Conditional riders (e.g. "vs fear") live in the
 * description; only always-on effects are encoded so they flow into totals.
 */
type Fx = [target: string, op: "add" | "subtract", value: number, bonusType: BonusType];

function tpl(
  id: string,
  name: string,
  category: BuffCategory,
  description: string,
  duration: DurationSpec | undefined,
  fx: Fx[],
  tags: string[] = [],
): BuffTemplate {
  return {
    id,
    name,
    category,
    description,
    defaultDuration: duration,
    effects: fx.map(([target, operation, value, bonusType], i) => ({
      id: `${id}#${i}`,
      target,
      operation,
      value,
      bonusType,
    })),
    tags,
  };
}

export const BUFF_LIBRARY: BuffTemplate[] = [
  tpl(
    "tpl_haste",
    "Haste",
    "spell",
    "+1 dodge bonus to AC and Reflex saves, +1 on attack rolls, +30 ft to all movement speeds, and one extra attack at full bonus on a full attack.",
    { unit: "rounds", note: "1 round/level" },
    [
      ["defenses.armorClass", "add", 1, "dodge"],
      ["saves.reflex", "add", 1, "dodge"],
      ["attack", "add", 1, "untyped"],
      ["speed", "add", 30, "enhancement"],
    ],
    ["spell", "combat", "party"],
  ),
  tpl(
    "tpl_bless",
    "Bless",
    "spell",
    "Allies gain +1 morale bonus on attack rolls and saving throws against fear effects.",
    { unit: "minutes", note: "1 min/level" },
    [["attack", "add", 1, "morale"]],
    ["spell", "party"],
  ),
  tpl(
    "tpl_inspire_courage",
    "Inspire Courage (+1)",
    "class_feature",
    "Bardic performance: +1 morale bonus on attack and weapon damage rolls, and on saves vs charm and fear.",
    { unit: "rounds", note: "while performing" },
    [["attack", "add", 1, "morale"]],
    ["bard", "party"],
  ),
  tpl(
    "tpl_heroism",
    "Heroism",
    "spell",
    "+2 morale bonus on attack rolls, saving throws, and skill checks.",
    { unit: "minutes", note: "10 min/level" },
    [
      ["attack", "add", 2, "morale"],
      ["saves.fortitude", "add", 2, "morale"],
      ["saves.reflex", "add", 2, "morale"],
      ["saves.will", "add", 2, "morale"],
    ],
    ["spell"],
  ),
  tpl(
    "tpl_prayer",
    "Prayer",
    "spell",
    "Allies gain a +1 luck bonus on attack rolls, weapon damage, saves, and skill checks (enemies take −1).",
    { unit: "rounds", note: "1 round/level" },
    [
      ["attack", "add", 1, "luck"],
      ["saves.fortitude", "add", 1, "luck"],
      ["saves.reflex", "add", 1, "luck"],
      ["saves.will", "add", 1, "luck"],
    ],
    ["spell", "party"],
  ),
  tpl(
    "tpl_mage_armor",
    "Mage Armor",
    "spell",
    "+4 armor bonus to AC (does not stack with worn armor).",
    { unit: "hours", note: "1 hour/level" },
    [["defenses.armorClass", "add", 4, "armor"]],
    ["spell"],
  ),
  tpl(
    "tpl_shield",
    "Shield",
    "spell",
    "+4 shield bonus to AC and immunity to magic missile.",
    { unit: "minutes", note: "1 min/level" },
    [["defenses.armorClass", "add", 4, "shield"]],
    ["spell"],
  ),
  tpl(
    "tpl_shield_of_faith",
    "Shield of Faith",
    "spell",
    "+2 deflection bonus to AC (+1 per six levels, max +5).",
    { unit: "minutes", note: "1 min/level" },
    [["defenses.armorClass", "add", 2, "deflection"]],
    ["spell"],
  ),
  tpl(
    "tpl_barkskin",
    "Barkskin",
    "spell",
    "+2 natural armor bonus to AC (+1 per 3 caster levels above 3rd, max +5).",
    { unit: "minutes", note: "10 min/level" },
    [["defenses.armorClass", "add", 2, "natural_armor"]],
    ["spell"],
  ),
  tpl(
    "tpl_bulls_strength",
    "Bull's Strength",
    "spell",
    "+4 enhancement bonus to Strength.",
    { unit: "minutes", note: "1 min/level" },
    [["abilities.str", "add", 4, "enhancement"]],
    ["spell"],
  ),
  tpl(
    "tpl_cats_grace",
    "Cat's Grace",
    "spell",
    "+4 enhancement bonus to Dexterity.",
    { unit: "minutes", note: "1 min/level" },
    [["abilities.dex", "add", 4, "enhancement"]],
    ["spell"],
  ),
  tpl(
    "tpl_bears_endurance",
    "Bear's Endurance",
    "spell",
    "+4 enhancement bonus to Constitution.",
    { unit: "minutes", note: "1 min/level" },
    [["abilities.con", "add", 4, "enhancement"]],
    ["spell"],
  ),
  tpl(
    "tpl_eagles_splendor",
    "Eagle's Splendor",
    "spell",
    "+4 enhancement bonus to Charisma.",
    { unit: "minutes", note: "1 min/level" },
    [["abilities.cha", "add", 4, "enhancement"]],
    ["spell"],
  ),
  tpl(
    "tpl_foxs_cunning",
    "Fox's Cunning",
    "spell",
    "+4 enhancement bonus to Intelligence.",
    { unit: "minutes", note: "1 min/level" },
    [["abilities.int", "add", 4, "enhancement"]],
    ["spell"],
  ),
  tpl(
    "tpl_owls_wisdom",
    "Owl's Wisdom",
    "spell",
    "+4 enhancement bonus to Wisdom.",
    { unit: "minutes", note: "1 min/level" },
    [["abilities.wis", "add", 4, "enhancement"]],
    ["spell"],
  ),
  tpl(
    "tpl_rage",
    "Rage",
    "class_feature",
    "Barbarian rage: +2 morale to Strength and Constitution, +1 morale on Will saves, −2 penalty to AC.",
    { unit: "rounds", note: "rounds/day" },
    [
      ["abilities.str", "add", 2, "morale"],
      ["abilities.con", "add", 2, "morale"],
      ["saves.will", "add", 1, "morale"],
      ["defenses.armorClass", "subtract", 2, "penalty"],
    ],
    ["barbarian", "combat"],
  ),
  tpl(
    "tpl_enlarge_person",
    "Enlarge Person",
    "spell",
    "Size increases one category: +2 size to Strength, −2 size to Dexterity, −1 size penalty to AC and attack rolls, +5 ft reach.",
    { unit: "minutes", note: "1 min/level" },
    [
      ["abilities.str", "add", 2, "size"],
      ["abilities.dex", "subtract", 2, "size"],
      ["defenses.armorClass", "subtract", 1, "size"],
      ["attack", "subtract", 1, "size"],
    ],
    ["spell"],
  ),
  tpl(
    "tpl_fatigued",
    "Fatigued",
    "condition",
    "Cannot run or charge; −2 penalty to Strength and Dexterity.",
    { unit: "rest", note: "until rested" },
    [
      ["abilities.str", "subtract", 2, "penalty"],
      ["abilities.dex", "subtract", 2, "penalty"],
    ],
    ["condition", "debuff"],
  ),
  tpl(
    "tpl_shaken",
    "Shaken",
    "condition",
    "−2 penalty on attack rolls, saving throws, skill checks, and ability checks.",
    { unit: "rounds" },
    [
      ["attack", "subtract", 2, "penalty"],
      ["saves.fortitude", "subtract", 2, "penalty"],
      ["saves.reflex", "subtract", 2, "penalty"],
      ["saves.will", "subtract", 2, "penalty"],
    ],
    ["condition", "fear", "debuff"],
  ),
  tpl(
    "tpl_sickened",
    "Sickened",
    "condition",
    "−2 penalty on attack rolls, weapon damage, saving throws, skill checks, and ability checks.",
    { unit: "minutes" },
    [
      ["attack", "subtract", 2, "penalty"],
      ["saves.fortitude", "subtract", 2, "penalty"],
      ["saves.reflex", "subtract", 2, "penalty"],
      ["saves.will", "subtract", 2, "penalty"],
    ],
    ["condition", "debuff"],
  ),
];

/** Look up a library template by id. */
export function findBuffTemplate(id: string): BuffTemplate | undefined {
  return BUFF_LIBRARY.find((t) => t.id === id);
}
