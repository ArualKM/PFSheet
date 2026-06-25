import type {
  AbilityKey,
  AutomationEffect,
  BonusType,
  ModifierEntry,
  PathForgeCharacterV1,
} from "@pathforge/schema";
import { ABILITY_KEYS } from "@pathforge/schema";
import { evaluate, type Resolver } from "./formula/evaluator";
import { applyStacking, type StackInput } from "./stacking";
import { getSizeModifiers } from "./sizes";

/* -------------------------------------------------------------------------- */
/* Ability modifiers                                                          */
/* -------------------------------------------------------------------------- */

export type AbilityComputation = {
  key: string;
  label: string;
  baseScore: number;
  effectiveScore: number;
  modifier: number;
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function abilityModifier(effectiveScore: number): number {
  return Math.floor((effectiveScore - 10) / 2);
}

/** Parse the leading (possibly negative) integer out of a string like "30 ft". */
function parseLeadingInt(s: string): number {
  const m = /-?\d+/.exec(s ?? "");
  return m ? parseInt(m[0], 10) : 0;
}

export function computeAbilities(
  character: PathForgeCharacterV1,
  index?: ModifierIndex,
): Record<string, AbilityComputation> {
  const out: Record<string, AbilityComputation> = {};
  const all = { ...character.abilities.primary, ...character.abilities.custom };
  for (const [key, score] of Object.entries(all)) {
    if (!score) continue;
    const base = num(score.baseScore ?? score.score, 10);
    // Typed ability bonuses — the sheet's enhancement/inherent fields AND active
    // buffs (e.g. Bull's Strength) — all flow through the stacking engine so the
    // same type doesn't stack (highest wins), then cascade into every derived stat.
    const typedMods: StackInput[] = [...(index?.get(`ability.${key}`) ?? [])];
    if (num(score.enhancement) !== 0)
      typedMods.push({ id: `${key}.enhancement`, label: "Enhancement", value: num(score.enhancement), bonusType: "enhancement" });
    if (num(score.inherent) !== 0)
      typedMods.push({ id: `${key}.inherent`, label: "Inherent", value: num(score.inherent), bonusType: "inherent" });
    const effective =
      num(score.score, base) +
      num(score.tempAdjust) +
      applyStacking(typedMods).total -
      num(score.drain) -
      num(score.penalty) -
      num(score.damage);
    out[key] = {
      key,
      label: score.label,
      baseScore: base,
      effectiveScore: effective,
      modifier: abilityModifier(effective),
    };
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Modifier index — passive, always-on numeric modifiers by target domain     */
/* -------------------------------------------------------------------------- */

type IndexedMod = StackInput & { bonusType: BonusType };

function classifyTarget(target: string): string | null {
  const t = target.toLowerCase();
  if (t.includes("armorclass") || t === "ac" || t.startsWith("defenses.armorclass")) return "ac";
  if (t.includes("cmd")) return "cmd";
  if (t.includes("fortitude")) return "save.fortitude";
  if (t.includes("reflex")) return "save.reflex";
  if (t.includes("will")) return "save.will";
  if (t.includes("initiative") || t === "init") return "init";
  if (t.includes("speed")) return "speed";
  if (t.includes("melee")) return "attack.melee";
  if (t.includes("ranged")) return "attack.ranged";
  if (t.includes("cmb")) return "attack.cmb";
  if (t.includes("attack")) return "attack.all";
  const skill = t.match(/^skills?\.([a-z0-9_]+)/);
  if (skill?.[1]) return `skill.${skill[1]}`;
  const ability = t.match(/^abilities?\.([a-z]{3})/);
  if (ability?.[1]) return `ability.${ability[1]}`;
  return null;
}

function effectToMod(
  id: string,
  label: string,
  source: string,
  e: Pick<AutomationEffect, "target" | "operation" | "value" | "bonusType" | "condition">,
): IndexedMod | null {
  if (e.condition) return null; // conditional modifiers excluded from base totals
  if (e.operation !== "add" && e.operation !== "subtract") return null;
  const raw = num(e.value, NaN);
  if (Number.isNaN(raw)) return null;
  const value = e.operation === "subtract" ? -raw : raw;
  return { id, label, source, value, bonusType: e.bonusType ?? "untyped" };
}

function modifierEntryToMod(source: string, m: ModifierEntry): IndexedMod | null {
  if (m.condition) return null;
  if (m.enabled === false) return null;
  const value = num(m.value, NaN);
  if (Number.isNaN(value)) return null;
  return {
    id: m.id,
    label: m.label,
    source,
    value,
    bonusType: m.bonusType ?? "untyped",
    stackingGroup: m.stackingGroup,
  };
}

export type ModifierIndex = Map<string, IndexedMod[]>;

export function buildModifierIndex(character: PathForgeCharacterV1): ModifierIndex {
  const index: ModifierIndex = new Map();
  const push = (domain: string | null, mod: IndexedMod | null): void => {
    if (!domain || !mod) return;
    const arr = index.get(domain);
    if (arr) arr.push(mod);
    else index.set(domain, [mod]);
  };

  // Active, enabled buffs.
  for (const buff of character.buffs.active) {
    if (buff.enabled === false) continue;
    for (const e of buff.effects) {
      push(classifyTarget(e.target), effectToMod(e.id, buff.name, `Buff: ${buff.name}`, e));
    }
  }

  // Equipped item modifiers + automation.
  const allItems = [
    ...character.inventory.weapons,
    ...character.inventory.armorAndShields,
    ...character.inventory.potionsScrollsMagicItems,
    ...character.inventory.gear,
    ...character.inventory.otherItems,
  ];
  for (const item of allItems) {
    if (!item.equipped) continue;
    for (const m of item.modifiers) push(classifyTarget(m.target ?? ""), modifierEntryToMod(item.name, m));
    for (const e of item.automation) push(classifyTarget(e.target), effectToMod(e.id, item.name, item.name, e));
  }

  // Passive feature / trait / feat automation.
  const passives = [...character.features.list, ...character.traits.list, ...character.feats.list];
  for (const f of passives) {
    for (const e of f.automation) push(classifyTarget(e.target), effectToMod(e.id, f.name, f.name, e));
  }

  // Always-on modifiers entered directly on a stat (entries with no condition).
  for (const m of character.defenses.armorClass.conditionalModifiers) {
    push("ac", modifierEntryToMod("Armor Class", m));
  }
  const saves = character.defenses.savingThrows;
  for (const [key, domain] of [
    ["fortitude", "save.fortitude"],
    ["reflex", "save.reflex"],
    ["will", "save.will"],
  ] as const) {
    for (const m of saves[key].misc) push(domain, modifierEntryToMod(`${key} save`, m));
    for (const m of saves[key].conditionalModifiers) push(domain, modifierEntryToMod(`${key} save`, m));
  }
  for (const m of character.combat.initiative.conditionalModifiers) {
    push("init", modifierEntryToMod("Initiative", m));
  }

  return index;
}

/* -------------------------------------------------------------------------- */
/* Resolver                                                                    */
/* -------------------------------------------------------------------------- */

const AC_COMPONENT_TYPES: Record<string, BonusType> = {
  armor: "armor",
  shield: "shield",
  naturalArmor: "natural_armor",
  deflection: "deflection",
  dodge: "dodge",
};
const AC_NAMED = new Set<BonusType>(["armor", "shield", "natural_armor", "deflection", "dodge"]);

function stackTotal(mods: IndexedMod[]): number {
  return applyStacking(mods).total;
}

/** Sum only the modifiers of a given bonus type within a domain bucket. */
function stackTotalOfType(mods: IndexedMod[], type: BonusType): number {
  return applyStacking(mods.filter((m) => m.bonusType === type)).total;
}

/** Resolves `@{path}` references against a character + its modifier index. */
export class CharacterResolver implements Resolver {
  private readonly abilities: Record<string, AbilityComputation>;
  private readonly index: ModifierIndex;
  private readonly size = getSizeModifiers(undefined);
  /** Optional local overlay (used while evaluating a single skill row). */
  local: Record<string, number> = {};

  constructor(
    private readonly character: PathForgeCharacterV1,
    abilities?: Record<string, AbilityComputation>,
    index?: ModifierIndex,
  ) {
    this.index = index ?? buildModifierIndex(character);
    this.abilities = abilities ?? computeAbilities(character, this.index);
    this.size = getSizeModifiers(character.identity.size);
  }

  private bucket(domain: string): IndexedMod[] {
    return this.index.get(domain) ?? [];
  }

  private acComponent(name: string): number {
    if (name === "misc") {
      const mods = this.bucket("ac").filter((m) => !AC_NAMED.has(m.bonusType));
      return applyStacking(mods).total;
    }
    const type = AC_COMPONENT_TYPES[name];
    if (!type) return 0;
    return stackTotalOfType(this.bucket("ac"), type);
  }

  private lookup(path: string): number | undefined {
    // Own-key check only — `path in this.local` would match inherited keys
    // like `__proto__`/`constructor` and leak non-numeric values.
    if (Object.prototype.hasOwnProperty.call(this.local, path)) return this.local[path];

    // abilities.<key>.mod | .score | .effectiveScore
    const abil = path.match(/^abilities\.([a-z0-9_]+)\.(mod|score|effectiveScore|effective)$/);
    if (abil) {
      const a = this.abilities[abil[1]!];
      if (!a) return 0;
      return abil[2] === "mod" ? a.modifier : a.effectiveScore;
    }

    switch (path) {
      case "level.total":
      case "level":
        return this.character.identity.totalLevel;
      case "combat.bab.total":
        return num(this.character.combat.bab.total);
      case "saves.fortitude.base":
        return num(this.character.defenses.savingThrows.fortitude.base);
      case "saves.reflex.base":
        return num(this.character.defenses.savingThrows.reflex.base);
      case "saves.will.base":
        return num(this.character.defenses.savingThrows.will.base);
      case "saves.fortitude.misc":
        return stackTotal(this.bucket("save.fortitude"));
      case "saves.reflex.misc":
        return stackTotal(this.bucket("save.reflex"));
      case "saves.will.misc":
        return stackTotal(this.bucket("save.will"));
      case "combat.initiative.misc":
        return stackTotal(this.bucket("init"));
      case "cmd.misc":
        return stackTotal(this.bucket("cmd"));
      case "attack.misc.melee":
        return stackTotal([...this.bucket("attack.melee"), ...this.bucket("attack.all")]);
      case "attack.misc.ranged":
        return stackTotal([...this.bucket("attack.ranged"), ...this.bucket("attack.all")]);
      case "attack.misc.cmb":
        return stackTotal([...this.bucket("attack.cmb"), ...this.bucket("attack.all")]);
      case "size.acMod":
        return this.size.acMod;
      case "size.attackMod":
        return this.size.attackMod;
      case "size.cmbMod":
        return this.size.cmbMod;
      case "size.cmdMod":
        return this.size.cmdMod;
      default:
        break;
    }

    // ac.<component>
    const ac = path.match(/^ac\.([a-zA-Z]+)$/);
    if (ac?.[1]) return this.acComponent(ac[1]);

    return undefined;
  }

  resolve(path: string) {
    const v = this.lookup(path);
    // Only report a reference as resolved when it produced a finite number.
    if (typeof v !== "number" || !Number.isFinite(v)) return { found: false, value: 0 };
    return { found: true, value: v };
  }

  has(path: string): boolean {
    const v = this.lookup(path);
    return typeof v === "number" && Number.isFinite(v);
  }
}

/* -------------------------------------------------------------------------- */
/* Top-level character computation                                            */
/* -------------------------------------------------------------------------- */

export type ComputedTerm = { ref: string; value: number };

export type ComputedValue = {
  value: number;
  formula: string;
  dependencies: string[];
  /** Each referenced path with its resolved value — powers the "Show Math" inspector. */
  terms: ComputedTerm[];
  warnings: string[];
  errors: string[];
};

export type ComputedAttack = {
  id: string;
  name: string;
  attackType: string;
  attackBonus: number;
  /** Raw damage expression (e.g. "1d8+7"); dice are not evaluated. */
  damage?: string;
  warnings: string[];
};

export type ComputedCharacter = {
  abilities: Record<string, AbilityComputation>;
  armorClass: { total: ComputedValue; touch: ComputedValue; flatFooted: ComputedValue; cmd: ComputedValue };
  saves: { fortitude: ComputedValue; reflex: ComputedValue; will: ComputedValue };
  initiative: ComputedValue;
  attackBonuses: { melee: ComputedValue; ranged: ComputedValue; cmb: ComputedValue };
  attacks: ComputedAttack[];
  skills: Record<string, ComputedValue>;
  /** Compact summary for dashboard cards / API. */
  summary: {
    totalLevel: number;
    abilityMods: Record<string, number>;
    ac: number;
    touch: number;
    flatFooted: number;
    cmd: number;
    fortitude: number;
    reflex: number;
    will: number;
    initiative: number;
    /** Effective land speed: parsed base + stacked speed modifiers (buffs). */
    speed: { base: number; bonus: number; total: number };
    hp: { current: number; max: number; temp: number };
  };
};

function evalWith(formula: string, resolver: CharacterResolver, overrideFormula?: string): ComputedValue {
  const f = overrideFormula ?? formula;
  const r = evaluate(f, resolver);
  // Resolve each dependency now, while any local (per-skill) scope is still set.
  const terms = r.dependencies.map((ref) => ({ ref, value: resolver.resolve(ref).value }));
  return {
    value: r.value,
    formula: f,
    dependencies: r.dependencies,
    terms,
    warnings: r.warnings,
    errors: r.errors,
  };
}

/** Look up an active formula override for a target path, if enabled. */
function overrideFor(character: PathForgeCharacterV1, path: string): string | undefined {
  const o = character.formulas.overrides[path];
  return o && o.enabled !== false ? o.formula : undefined;
}

export function computeCharacter(character: PathForgeCharacterV1): ComputedCharacter {
  const index = buildModifierIndex(character);
  const abilities = computeAbilities(character, index);
  const resolver = new CharacterResolver(character, abilities, index);

  const ac = character.defenses.armorClass.formulas;
  const saves = character.defenses.savingThrows;

  const armorClass = {
    total: evalWith(ac.total, resolver, overrideFor(character, "defenses.armorClass.total")),
    touch: evalWith(ac.touch, resolver, overrideFor(character, "defenses.armorClass.touch")),
    flatFooted: evalWith(ac.flatFooted, resolver, overrideFor(character, "defenses.armorClass.flatFooted")),
    cmd: evalWith(ac.cmd, resolver, overrideFor(character, "defenses.armorClass.cmd")),
  };

  const savesComputed = {
    fortitude: evalWith(saves.fortitude.formula ?? "0", resolver, overrideFor(character, "defenses.savingThrows.fortitude")),
    reflex: evalWith(saves.reflex.formula ?? "0", resolver, overrideFor(character, "defenses.savingThrows.reflex")),
    will: evalWith(saves.will.formula ?? "0", resolver, overrideFor(character, "defenses.savingThrows.will")),
  };

  const initiative = evalWith(
    character.combat.initiative.formula,
    resolver,
    overrideFor(character, "combat.initiative"),
  );

  const attackBonuses = {
    melee: evalWith(character.combat.attackBonuses.melee, resolver),
    ranged: evalWith(character.combat.attackBonuses.ranged, resolver),
    cmb: evalWith(character.combat.attackBonuses.cmb, resolver),
  };

  // Skills — evaluate each row with a local scope overlay.
  const skills: Record<string, ComputedValue> = {};
  const classBonusDefault = character.skills.settings.classSkillBonusDefault ?? 3;
  for (const skill of character.skills.list) {
    const abilityMod = abilities[skill.ability]?.modifier ?? 0;
    const classSkillBonus = skill.classSkill && skill.ranks > 0 ? classBonusDefault : 0;
    const miscMods: IndexedMod[] = [
      ...skill.misc
        .map((m) => modifierEntryToMod(skill.label, m))
        .filter((m): m is IndexedMod => m !== null),
      ...(index.get(`skill.${skill.key}`) ?? []),
    ];
    const miscTotal = applyStacking(miscMods).total;
    resolver.local = {
      ranks: skill.ranks,
      abilityMod,
      classSkillBonus,
      armorCheckPenalty: 0,
      misc: miscTotal,
    };
    const formula = skill.formula ?? "@{ranks} + @{abilityMod} + @{classSkillBonus} + @{misc}";
    skills[skill.key] = evalWith(formula, resolver);
  }
  resolver.local = {};

  // Speed: base land speed (parsed from the display string) + stacked speed modifiers.
  const speedBase = parseLeadingInt(character.combat.speed.base);
  const speedBonus = applyStacking(index.get("speed") ?? []).total;

  // Individual attack lines: resolve each attack's to-hit formula; damage dice
  // are presentation-only and passed through untouched.
  const attacks: ComputedAttack[] = character.combat.attacks
    .filter((a) => a.enabled !== false)
    .map((a) => {
      const r = a.attackFormula ? evaluate(a.attackFormula, resolver) : null;
      return {
        id: a.id,
        name: a.name,
        attackType: a.attackType,
        attackBonus: r ? r.value : 0,
        damage: a.damageFormula,
        warnings: r?.warnings ?? [],
      };
    });

  return {
    abilities,
    armorClass,
    saves: savesComputed,
    initiative,
    attackBonuses,
    attacks,
    skills,
    summary: {
      totalLevel: character.identity.totalLevel,
      abilityMods: Object.fromEntries(
        ABILITY_KEYS.map((k: AbilityKey) => [k, abilities[k]?.modifier ?? 0]),
      ),
      ac: armorClass.total.value,
      touch: armorClass.touch.value,
      flatFooted: armorClass.flatFooted.value,
      cmd: armorClass.cmd.value,
      fortitude: savesComputed.fortitude.value,
      reflex: savesComputed.reflex.value,
      will: savesComputed.will.value,
      initiative: initiative.value,
      speed: { base: speedBase, bonus: speedBonus, total: speedBase + speedBonus },
      hp: {
        current: character.health.currentHp,
        max: num(character.health.maxHp),
        temp: character.health.tempHp,
      },
    },
  };
}
