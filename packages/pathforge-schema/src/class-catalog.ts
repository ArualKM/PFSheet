import type { BabProgression, ClassPreset, SaveProgression } from "./common";
import type { PathForgeCharacterV1 } from "./character";
import { DEFAULT_SKILLS } from "./skills";
import { spellsPerDayTableFor } from "./spell-tables";
import { isGestalt, gestaltLevel } from "./gestalt";

/**
 * §6.1 Prebuilt PF1e class presets (mechanics only — no rules text, like
 * buff-templates.ts / optional-rules.ts). A preset fills the parts of a sheet that
 * class determines (BAB, saves, HP, class skills, caster entry) by WRITING the same
 * stored fields computeCharacter already reads — it never changes the engine.
 */
// ClassPreset + its progression enums now live in common.ts (shared with identity.ts's per-row cached
// compendium preset, without an import cycle). Re-exported here so existing importers are unaffected.
export type { SaveProgression, BabProgression, CasterType, ClassPreset } from "./common";
export type HpMethod = "manual" | "average" | "max";

const ALL_KNOWLEDGE = [
  "knowledge_arcana",
  "knowledge_dungeoneering",
  "knowledge_engineering",
  "knowledge_geography",
  "knowledge_history",
  "knowledge_local",
  "knowledge_nature",
  "knowledge_nobility",
  "knowledge_planes",
  "knowledge_religion",
];

export const CLASS_CATALOG: ClassPreset[] = [
  {
    key: "barbarian",
    name: "Barbarian",
    hitDie: 12,
    bab: "full",
    saves: { fortitude: "good", reflex: "poor", will: "poor" },
    skillRanksPerLevel: 4,
    classSkillKeys: [
      "acrobatics", "climb", "craft", "handle_animal", "intimidate",
      "knowledge_nature", "perception", "ride", "survival", "swim",
    ],
  },
  {
    key: "bard",
    name: "Bard",
    hitDie: 8,
    bab: "three_quarter",
    saves: { fortitude: "poor", reflex: "good", will: "good" },
    skillRanksPerLevel: 6,
    classSkillKeys: [
      "acrobatics", "appraise", "bluff", "climb", "craft", "diplomacy", "disguise",
      "escape_artist", "intimidate", ...ALL_KNOWLEDGE, "linguistics", "perception",
      "perform", "profession", "sense_motive", "sleight_of_hand", "spellcraft",
      "stealth", "use_magic_device",
    ],
    caster: { casterType: "spontaneous", castingAbility: "cha", clProgression: "full" },
  },
  {
    key: "cleric",
    name: "Cleric",
    hitDie: 8,
    bab: "three_quarter",
    saves: { fortitude: "good", reflex: "poor", will: "good" },
    skillRanksPerLevel: 2,
    classSkillKeys: [
      "appraise", "craft", "diplomacy", "heal", "knowledge_arcana", "knowledge_history",
      "knowledge_nobility", "knowledge_planes", "knowledge_religion", "linguistics",
      "profession", "sense_motive", "spellcraft",
    ],
    caster: { casterType: "prepared", castingAbility: "wis", clProgression: "full" },
  },
  {
    key: "druid",
    name: "Druid",
    hitDie: 8,
    bab: "three_quarter",
    saves: { fortitude: "good", reflex: "poor", will: "good" },
    skillRanksPerLevel: 4,
    classSkillKeys: [
      "climb", "craft", "fly", "handle_animal", "heal", "knowledge_geography",
      "knowledge_nature", "perception", "profession", "ride", "spellcraft", "survival", "swim",
    ],
    caster: { casterType: "prepared", castingAbility: "wis", clProgression: "full" },
  },
  {
    key: "fighter",
    name: "Fighter",
    hitDie: 10,
    bab: "full",
    saves: { fortitude: "good", reflex: "poor", will: "poor" },
    skillRanksPerLevel: 2,
    classSkillKeys: [
      "climb", "craft", "handle_animal", "intimidate", "knowledge_dungeoneering",
      "knowledge_engineering", "profession", "ride", "survival", "swim",
    ],
  },
  {
    key: "monk",
    name: "Monk",
    hitDie: 8,
    bab: "three_quarter",
    saves: { fortitude: "good", reflex: "good", will: "good" },
    skillRanksPerLevel: 4,
    classSkillKeys: [
      "acrobatics", "climb", "craft", "escape_artist", "intimidate", "knowledge_history",
      "knowledge_religion", "perception", "perform", "profession", "ride", "sense_motive",
      "stealth", "swim",
    ],
  },
  {
    key: "paladin",
    name: "Paladin",
    hitDie: 10,
    bab: "full",
    saves: { fortitude: "good", reflex: "poor", will: "good" },
    skillRanksPerLevel: 2,
    classSkillKeys: [
      "craft", "diplomacy", "handle_animal", "heal", "knowledge_nobility",
      "knowledge_religion", "profession", "ride", "sense_motive", "spellcraft",
    ],
    caster: { casterType: "prepared", castingAbility: "cha", clProgression: "minus_three" },
  },
  {
    key: "ranger",
    name: "Ranger",
    hitDie: 10,
    bab: "full",
    saves: { fortitude: "good", reflex: "good", will: "poor" },
    skillRanksPerLevel: 6,
    classSkillKeys: [
      "climb", "craft", "handle_animal", "heal", "intimidate", "knowledge_dungeoneering",
      "knowledge_geography", "knowledge_nature", "perception", "profession", "ride",
      "spellcraft", "stealth", "survival", "swim",
    ],
    caster: { casterType: "prepared", castingAbility: "wis", clProgression: "minus_three" },
  },
  {
    key: "rogue",
    name: "Rogue",
    hitDie: 8,
    bab: "three_quarter",
    saves: { fortitude: "poor", reflex: "good", will: "poor" },
    skillRanksPerLevel: 8,
    classSkillKeys: [
      "acrobatics", "appraise", "bluff", "climb", "craft", "diplomacy", "disable_device",
      "disguise", "escape_artist", "intimidate", "knowledge_dungeoneering", "knowledge_local",
      "linguistics", "perception", "perform", "profession", "sense_motive", "sleight_of_hand",
      "stealth", "swim", "use_magic_device",
    ],
  },
  {
    key: "sorcerer",
    name: "Sorcerer",
    hitDie: 6,
    bab: "half",
    saves: { fortitude: "poor", reflex: "poor", will: "good" },
    skillRanksPerLevel: 2,
    classSkillKeys: [
      "appraise", "bluff", "craft", "fly", "intimidate", "knowledge_arcana",
      "profession", "spellcraft", "use_magic_device",
    ],
    caster: { casterType: "spontaneous", castingAbility: "cha", clProgression: "full" },
  },
  {
    key: "wizard",
    name: "Wizard",
    hitDie: 6,
    bab: "half",
    saves: { fortitude: "poor", reflex: "poor", will: "good" },
    skillRanksPerLevel: 2,
    classSkillKeys: [
      "appraise", "craft", "fly", ...ALL_KNOWLEDGE, "linguistics", "profession", "spellcraft",
    ],
    caster: { casterType: "spellbook", castingAbility: "int", clProgression: "full" },
  },
];

export function getClassPreset(key: string): ClassPreset | undefined {
  return CLASS_CATALOG.find((c) => c.key === key);
}

// ---- Pure math helpers (produce STORED numbers the engine then reads) ----

export function babForLevel(prog: BabProgression, level: number): number {
  if (prog === "full") return level;
  if (prog === "three_quarter") return Math.floor((level * 3) / 4);
  return Math.floor(level / 2);
}

export function saveBaseForLevel(prog: SaveProgression, level: number): number {
  if (level < 1) return 0; // a 0-level class grants no base save (the +2 "good" floor is a 1st-level benefit)
  return prog === "good" ? Math.floor(level / 2) + 2 : Math.floor(level / 3);
}

export function skillRanksForLevel(perLevel: number, intMod: number, level: number): number {
  return Math.max(1, perLevel + intMod) * level;
}

const BAB_FRACTION: Record<BabProgression, number> = { full: 1, three_quarter: 0.75, half: 0.5 };
type LinkedClass = { row: { level: number }; preset: ClassPreset };

/** Fractional BAB (Unchained): Σ per-class (level × fraction), rounded down once. */
function fractionalBab(linked: LinkedClass[]): number {
  return Math.floor(linked.reduce((f, { row, preset }) => f + row.level * BAB_FRACTION[preset.bab], 0));
}

/** Fractional save (Unchained): a single +2 if any class has a good save in the category, plus
 * Σ per-class (level × 0.5 good / ⅓ poor), rounded down once. */
function fractionalSave(linked: LinkedClass[], save: "fortitude" | "reflex" | "will"): number {
  let frac = 0;
  let anyGood = false;
  for (const { row, preset } of linked) {
    if (preset.saves[save] === "good") {
      frac += row.level * 0.5;
      anyGood = true;
    } else {
      frac += row.level / 3;
    }
  }
  return Math.floor((anyGood ? 2 : 0) + frac);
}

/** BAB + base saves for a set of (track of) classes, fractional or standard. */
function trackBaseBonuses(linked: LinkedClass[], fractional: boolean) {
  if (fractional) {
    return {
      bab: fractionalBab(linked),
      fort: fractionalSave(linked, "fortitude"),
      ref: fractionalSave(linked, "reflex"),
      will: fractionalSave(linked, "will"),
    };
  }
  let bab = 0;
  let fort = 0;
  let ref = 0;
  let will = 0;
  for (const { row, preset } of linked) {
    bab += babForLevel(preset.bab, (row as { level: number }).level);
    fort += saveBaseForLevel(preset.saves.fortitude, (row as { level: number }).level);
    ref += saveBaseForLevel(preset.saves.reflex, (row as { level: number }).level);
    will += saveBaseForLevel(preset.saves.will, (row as { level: number }).level);
  }
  return { bab, fort, ref, will };
}

function hitDieNumber(die: string | number | undefined): number {
  if (typeof die === "number") return die;
  if (!die) return 0;
  const n = parseInt(String(die).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function avgPerHitDie(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

/**
 * Compute max HP from a character's class levels (PF1e): the very first character level takes the
 * full die; later levels take the die ("max") or its average ("average"). Each level adds the base
 * Constitution modifier, floored at a minimum of 1 hp per Hit Die, then favored-class hp bonuses are
 * added. Uses the base Con score (temporary Con boosts grant temp hp, not max hp). A class with no
 * hitDie defaults to d8.
 */
export function computeMaxHpFromLevels(
  character: PathForgeCharacterV1,
  method: "average" | "max",
  classes: PathForgeCharacterV1["identity"]["classes"] = character.identity.classes,
): { total: number; hd: number; con: number; fcb: number; levels: number } {
  const conMod = Math.floor(((character.abilities.primary.con.score ?? 10) - 10) / 2);
  const fcb = Math.max(0, character.health.favoredClassHpBonus ?? 0);
  let hd = 0;
  let levels = 0;
  let rolled = 0;
  let first = true;
  for (const row of classes) {
    const die = hitDieNumber(row.hitDie) || 8;
    for (let l = 0; l < row.level; l++) {
      const base = first ? die : method === "max" ? die : avgPerHitDie(die);
      first = false;
      hd += base;
      levels += 1;
      rolled += Math.max(1, base + conMod); // each HD yields at least 1 hp after Con
    }
  }
  return { total: rolled + fcb, hd, con: conMod * levels, fcb, levels };
}

export type ClassApplyReport = {
  wrote: string[];
  skipped: string[];
  warnings: string[];
  skillRankBudget: number;
};

export type ApplyClassOptions = {
  preset: ClassPreset;
  level: number;
  hpMethod?: HpMethod;
  /** Update an existing class row (by id) instead of matching by presetKey/adding new. */
  mergeIntoClassId?: string;
};

function genId(prefix: string): string {
  const raw = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${raw.replace(/-/g, "").slice(0, 10)}`;
}

/** Find a caster that belongs to a preset — by the rename-proof presetKey link, else by name. */
function findPresetCaster(character: PathForgeCharacterV1, preset: ClassPreset) {
  return (
    character.spellcasting.casters.find((c) => c.presetKey === preset.key) ??
    character.spellcasting.casters.find((c) => c.className.toLowerCase() === preset.name.toLowerCase())
  );
}

/**
 * Recompute the class-derived STORED stats (BAB total, save bases, and optionally HP)
 * by SUMMING over every catalog-linked class — a full recompute, not an additive
 * patch, so re-applying never double-counts. Classes without a presetKey can't be
 * derived and are reported as a warning.
 */
export function recomputeClassDerived(
  character: PathForgeCharacterV1,
  opts: { hpMethod?: HpMethod } = {},
): { wrote: string[]; warnings: string[] } {
  const wrote: string[] = [];
  const warnings: string[] = [];

  const linked = character.identity.classes
    .map((c) => ({ row: c, preset: c.presetKey ? getClassPreset(c.presetKey) : undefined }))
    .filter((x): x is { row: (typeof character.identity.classes)[number]; preset: ClassPreset } => !!x.preset);

  const manualCount = character.identity.classes.length - linked.length;
  if (manualCount > 0) {
    warnings.push(
      `${manualCount} class${manualCount === 1 ? "" : "es"} without a preset weren't included in the BAB/save recompute — set those manually. (HP from levels counts every class; set its Hit Die or it defaults to d8.)`,
    );
  }

  if (linked.length === 0) return { wrote, warnings };

  // Fractional sums per-class fractions then rounds once; gestalt takes the BEST of two class tracks
  // (per save independently) and makes itself the sole writer of BAB/saves/HP.
  const fractional = !!character.rules.variants.fractionalBabSaves;
  const gestalt = isGestalt(character);
  let bab: number;
  let fort: number;
  let ref: number;
  let will: number;
  if (gestalt) {
    const trackA = linked.filter(({ row }) => (row as { track?: string }).track !== "b");
    const trackB = linked.filter(({ row }) => (row as { track?: string }).track === "b");
    const A = trackBaseBonuses(trackA, fractional);
    const B = trackBaseBonuses(trackB, fractional);
    bab = Math.max(A.bab, B.bab);
    fort = Math.max(A.fort, B.fort);
    ref = Math.max(A.ref, B.ref);
    will = Math.max(A.will, B.will);
    // Gestalt character level = the higher track total, not the sum of every class level.
    character.identity.totalLevel = gestaltLevel(character);
  } else {
    ({ bab, fort, ref, will } = trackBaseBonuses(linked, fractional));
  }
  character.combat.bab.total = bab;
  character.defenses.savingThrows.fortitude.base = fort;
  character.defenses.savingThrows.reflex.base = ref;
  character.defenses.savingThrows.will.base = will;
  wrote.push(`Set BAB +${bab}; saves Fort +${fort}/Ref +${ref}/Will +${will}`);

  // Keep each caster's level in sync with its class level (so a Level edit + recompute
  // doesn't leave spellcasting CL stale).
  for (const { row, preset } of linked) {
    if (!preset.caster) continue;
    const cl = preset.caster.clProgression === "minus_three" ? Math.max(0, row.level - 3) : row.level;
    const caster = findPresetCaster(character, preset);
    if (caster) caster.casterLevel = cl;
  }

  const hpMethod = opts.hpMethod ?? "manual";
  if (hpMethod !== "manual") {
    // HD (across all classes) + Con + FCB. Gestalt uses the better track's HP, not both summed.
    let hp: number;
    if (gestalt) {
      const all = character.identity.classes;
      const a = all.filter((c) => c.track !== "b");
      const b = all.filter((c) => c.track === "b");
      hp = Math.max(
        computeMaxHpFromLevels(character, hpMethod, a).total,
        computeMaxHpFromLevels(character, hpMethod, b).total,
      );
    } else {
      hp = computeMaxHpFromLevels(character, hpMethod).total;
    }
    character.health.maxHp = hp;
    if (character.health.currentHp === 0) character.health.currentHp = hp;
    wrote.push(`Set max HP to ${hp} (${hpMethod} + Con + FCB)`);
  }

  return { wrote, warnings };
}

/**
 * Apply a class preset to a character, MUTATING it in place and returning a report.
 * Non-clobbering: class skills are unioned (never reset), BAB/saves/HP are recomputed
 * from all classes (idempotent), and spells/skill-ranks are never silently distributed.
 */
export function applyClassPreset(
  character: PathForgeCharacterV1,
  opts: ApplyClassOptions,
): ClassApplyReport {
  const { preset, level, hpMethod = "manual", mergeIntoClassId } = opts;
  const wrote: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  // 1. Class row — update the matched row, else add one.
  let row = mergeIntoClassId
    ? character.identity.classes.find((c) => c.id === mergeIntoClassId)
    : character.identity.classes.find((c) => c.presetKey === preset.key) ??
      // Adopt a matching custom (preset-less) row rather than creating a duplicate.
      character.identity.classes.find(
        (c) => !c.presetKey && c.name.toLowerCase() === preset.name.toLowerCase(),
      );
  if (row) {
    row.level = level;
    row.name = preset.name;
    row.hitDie = `d${preset.hitDie}`;
    row.presetKey = preset.key;
    wrote.push(`Updated ${preset.name} to level ${level}`);
  } else {
    row = {
      id: genId("class"),
      name: preset.name,
      level,
      hitDie: `d${preset.hitDie}`,
      presetKey: preset.key,
    };
    character.identity.classes.push(row);
    wrote.push(`Added ${preset.name} ${level}`);
  }

  // 2. Total level.
  character.identity.totalLevel = character.identity.classes.reduce((s, c) => s + (c.level || 0), 0);

  // 3. Class skills — union only (flip false→true; never remove or touch ranks/misc).
  //    Create a row for any class-skill key with no row yet (e.g. the repeatable
  //    Craft/Profession/Perform skills a fresh sheet doesn't seed) so the +3 isn't lost.
  let marked = 0;
  const skillKeys = new Set(preset.classSkillKeys);
  const present = new Set(character.skills.list.map((s) => s.key));
  for (const sk of character.skills.list) {
    if (skillKeys.has(sk.key) && !sk.classSkill) {
      sk.classSkill = true;
      marked++;
    }
  }
  for (const key of preset.classSkillKeys) {
    if (present.has(key)) continue;
    const def = DEFAULT_SKILLS.find((d) => d.key === key);
    if (!def) continue;
    character.skills.list.push({
      id: genId("skill"),
      key: def.key,
      label: def.label,
      ability: def.ability,
      trainedOnly: def.trainedOnly,
      armorCheckPenalty: def.armorCheckPenalty,
      classSkill: true,
      ranks: 0,
      misc: [],
      conditional: [],
    });
    present.add(key);
    marked++;
  }
  if (marked) wrote.push(`Marked ${marked} class skill${marked === 1 ? "" : "s"}`);

  // 4. Spellcasting — add a caster entry only if none exists for this class; otherwise
  //    just bump the existing caster's level (never clobber a customized formula).
  if (preset.caster) {
    const cl = preset.caster.clProgression === "minus_three" ? Math.max(0, level - 3) : level;
    const table = spellsPerDayTableFor(preset.key);
    const existing = findPresetCaster(character, preset);
    if (existing) {
      existing.casterLevel = cl;
      existing.classLevel = level; // the class level indexes the per-day table
      existing.presetKey = preset.key; // backfill the link so future matches survive a rename
      // Backfill auto-slots for a caster created before its table existed — but never
      // re-enable it if the user deliberately turned it off (no table override present).
      if (table && !existing.spellsPerDayTable) {
        existing.spellsPerDayTable = table;
        existing.autoSlots = true;
      }
      skipped.push(`Kept your ${preset.name} spellcasting (set caster level ${cl})`);
    } else {
      character.spellcasting.casters.push({
        id: genId("caster"),
        className: preset.name,
        presetKey: preset.key,
        casterType: preset.caster.casterType,
        casterLevel: cl,
        classLevel: level,
        concentrationFormula: "",
        castingAbility: preset.caster.castingAbility,
        conditionalModifiers: [],
        spellsPerDay: {},
        bonusSpells: {},
        saveDcFormula: `10 + @{spellLevel} + @{abilities.${preset.caster.castingAbility}.mod}`,
        // Recognized classes get auto slots seeded from the per-day table; the rest stay manual.
        autoSlots: !!table,
        spellsPerDayTable: table,
      });
      wrote.push(`Added ${preset.name} spellcasting (CL ${cl}, ${preset.caster.casterType})`);
    }
  }

  // 5. Favored class — claim it only if nothing else is favored (non-destructive).
  if (!character.identity.classes.some((c) => c.favoredClass)) {
    row.favoredClass = true;
    if (!character.progression.favoredClasses.includes(preset.name)) {
      character.progression.favoredClasses.push(preset.name);
    }
  }

  // 6. Recompute BAB/saves/HP from all classes (idempotent).
  const rec = recomputeClassDerived(character, { hpMethod });
  wrote.push(...rec.wrote);
  warnings.push(...rec.warnings);

  // 7. Advisory skill-rank budget for THIS class (never auto-distributed).
  const intScore = character.abilities.primary.int?.score ?? 10;
  const intMod = Math.floor((intScore - 10) / 2);
  const skillRankBudget = skillRanksForLevel(preset.skillRanksPerLevel, intMod, level);

  return { wrote, skipped, warnings, skillRankBudget };
}
