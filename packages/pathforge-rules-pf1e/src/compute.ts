import type {
  AbilityKey,
  AutomationEffect,
  BonusType,
  ModifierEntry,
  PathForgeCharacterV1,
} from "@pathforge/schema";
import { ABILITY_KEYS, bonusSpellsForLevel } from "@pathforge/schema";
import { evaluate, type Resolver } from "./formula/evaluator";
import { applyStacking, type StackInput } from "./stacking";
import { getSizeModifiers } from "./sizes";
import { conditionEffects } from "./conditions";

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
  if (t === "saves" || t === "save.all" || t === "saves.all" || t === "all_saves") return "save.all";
  if (t.includes("initiative") || t === "init") return "init";
  if (t.includes("speed")) return "speed";
  if (t.includes("melee")) return "attack.melee";
  if (t.includes("ranged")) return "attack.ranged";
  if (t.includes("cmb")) return "attack.cmb";
  if (t.includes("attack")) return "attack.all";
  if (t === "skills" || t === "skill.all" || t === "skills.all" || t === "all_skills") return "skill.all";
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
  e: Pick<AutomationEffect, "target" | "operation" | "value" | "bonusType" | "condition" | "stackingGroup">,
  resolver?: Resolver,
): IndexedMod | null {
  if (e.condition) return null; // conditional modifiers excluded from base totals
  if (e.operation !== "add" && e.operation !== "subtract") return null;
  let raw = num(e.value, NaN);
  // A string value may be a formula (e.g. "min(3, floor(@{level.total}/3))") —
  // evaluate it against the base resolver so buffs can scale off BAB, level, etc.
  if (Number.isNaN(raw) && typeof e.value === "string" && resolver) {
    const r = evaluate(e.value, resolver);
    if (!Number.isFinite(r.value)) return null;
    raw = r.value;
  }
  if (Number.isNaN(raw)) return null;
  const value = e.operation === "subtract" ? -raw : raw;
  return { id, label, source, value, bonusType: e.bonusType ?? "untyped", stackingGroup: e.stackingGroup };
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

export function buildModifierIndex(character: PathForgeCharacterV1, resolver?: Resolver): ModifierIndex {
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
      push(classifyTarget(e.target), effectToMod(e.id, buff.name, `Buff: ${buff.name}`, e, resolver));
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
    // Armor/shield AC bonus: armor and shield stack (different types); same-category keeps the
    // highest via the stacking engine. Type is chosen by the item's category.
    if (typeof item.armorBonus === "number" && item.armorBonus !== 0) {
      const bonusType: BonusType = item.category === "shield" ? "shield" : "armor";
      push("ac", { id: `armor-${item.id}`, label: item.name, source: item.name, value: item.armorBonus, bonusType });
    }
    for (const m of item.modifiers) push(classifyTarget(m.target ?? ""), modifierEntryToMod(item.name, m));
    for (const e of item.automation) push(classifyTarget(e.target), effectToMod(e.id, item.name, item.name, e, resolver));
  }

  // Passive feature / trait / feat automation.
  const passives = [...character.features.list, ...character.traits.list, ...character.feats.list];
  for (const f of passives) {
    for (const e of f.automation) push(classifyTarget(e.target), effectToMod(e.id, f.name, f.name, e, resolver));
  }

  // Active conditions apply their standard PF1e mechanical effects (Shaken −2 attacks/saves/
  // skills, Fatigued −2 Str/Dex, etc.). Free-typed / non-numeric conditions are ignored here.
  // De-dup by normalized name so the same condition listed twice (or in a different case) can't
  // double-apply; track groups (fear/fatigue) collapse to the most-severe via the stacking engine.
  const seenConditions = new Set<string>();
  for (const cond of character.health.conditions) {
    const key = cond.trim().toLowerCase();
    if (!key || seenConditions.has(key)) continue;
    seenConditions.add(key);
    for (const e of conditionEffects(cond)) {
      const mod = modifierEntryToMod(e.label, {
        id: `cond-${key}-${e.target}`,
        label: e.label,
        value: e.value,
        enabled: true,
        stackingGroup: e.group,
      });
      if (mod) push(classifyTarget(e.target), mod);
    }
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

/** All equipment items across every inventory bucket, in a single flat list. */
function allInventory(character: PathForgeCharacterV1) {
  return [
    ...character.inventory.weapons,
    ...character.inventory.armorAndShields,
    ...character.inventory.potionsScrollsMagicItems,
    ...character.inventory.gear,
    ...character.inventory.otherItems,
  ];
}

/** PF1e damage ability modifier by grip: ×1.5 two-handed, ×0.5 off-hand; a penalty applies in full. */
function weaponDamageMod(abilityMod: number, handed: string): number {
  if (abilityMod <= 0) return abilityMod;
  if (handed === "two") return Math.floor(abilityMod * 1.5);
  if (handed === "off") return Math.floor(abilityMod * 0.5);
  return abilityMod;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
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
    if (name === "maxDexPenalty") return this.maxDexPenalty();
    const type = AC_COMPONENT_TYPES[name];
    if (!type) return 0;
    return stackTotalOfType(this.bucket("ac"), type);
  }

  /**
   * The Max Dex penalty from equipped armor: the lowest maxDexBonus among equipped armor/shields
   * caps the Dex bonus to AC. Returns a non-positive number (the excess Dex to subtract), or 0 when
   * nothing caps Dex or the Dex bonus is already within the cap. A Dex *penalty* is never capped.
   */
  private maxDexPenalty(): number {
    const caps = allInventory(this.character)
      .filter((i) => i.equipped && typeof i.maxDexBonus === "number")
      .map((i) => i.maxDexBonus as number);
    if (caps.length === 0) return 0;
    const dexMod = this.abilities.dex?.modifier ?? 0;
    return Math.min(0, Math.min(...caps) - dexMod);
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
        return stackTotal([...this.bucket("save.fortitude"), ...this.bucket("save.all")]);
      case "saves.reflex.misc":
        return stackTotal([...this.bucket("save.reflex"), ...this.bucket("save.all")]);
      case "saves.will.misc":
        return stackTotal([...this.bucket("save.will"), ...this.bucket("save.all")]);
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
  damageType?: string;
  critRange?: string;
  critMultiplier?: string;
  range?: string;
  warnings: string[];
};

export type ComputedSpellSlots = {
  level: number;
  base: number;
  bonus: number;
  total: number;
  used: number;
  remaining: number;
  /** Slots currently filled (prepared casters), summed from preparedSpells. */
  prepared: number;
  /** Save DC for a spell of this level. */
  dc: number;
};

export type ComputedSpellcasting = {
  casterId: string;
  className: string;
  casterType: string;
  castingAbility: string;
  casterLevel: number;
  concentration: ComputedValue;
  slots: ComputedSpellSlots[];
};

export type ComputedCharacter = {
  abilities: Record<string, AbilityComputation>;
  armorClass: { total: ComputedValue; touch: ComputedValue; flatFooted: ComputedValue; cmd: ComputedValue };
  saves: { fortitude: ComputedValue; reflex: ComputedValue; will: ComputedValue };
  initiative: ComputedValue;
  attackBonuses: { melee: ComputedValue; ranged: ComputedValue; cmb: ComputedValue };
  attacks: ComputedAttack[];
  skills: Record<string, ComputedValue>;
  spellcasting: ComputedSpellcasting[];
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
    /** Compact spellcasting roll-up (absent for non-casters). */
    spells?: { casterCount: number; highestSpellLevel: number; totalSlots: number; usedSlots: number };
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

function resolveNumberOrFormula(v: number | { formula: string }, resolver: CharacterResolver): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof v.formula === "string") return evaluate(v.formula, resolver).value;
  return 0;
}

/**
 * §6.10 Per-caster spellcasting: caster level, concentration, and per-spell-level slots
 * (base + ability bonus spells, used/remaining/prepared) and save DCs. `@{casterLevel}`
 * and `@{spellLevel}` resolve via the resolver.local overlay (same machinery as skills).
 */
function computeSpellcasting(
  character: PathForgeCharacterV1,
  abilities: Record<string, AbilityComputation>,
  resolver: CharacterResolver,
): ComputedSpellcasting[] {
  const out: ComputedSpellcasting[] = [];
  const isPreparedType = (t: string) => t === "prepared" || t === "spellbook";
  const preparedCasterIds = character.spellcasting.casters.filter((c) => isPreparedType(c.casterType));
  // A prepared spell with no casterId is attributable only when there's exactly one prepared caster.
  const solePreparedId = preparedCasterIds.length === 1 ? preparedCasterIds[0]!.id : null;
  for (const caster of character.spellcasting.casters) {
    const cl = resolveNumberOrFormula(caster.casterLevel, resolver);
    const ability = caster.castingAbility || "int";
    const abilityMod = abilities[ability]?.modifier ?? 0;
    const isPrepared = isPreparedType(caster.casterType);

    resolver.local = { casterLevel: cl };
    const concFormula = caster.concentrationFormula?.trim()
      ? caster.concentrationFormula
      : `@{casterLevel} + @{abilities.${ability}.mod}`;
    const concentration = evalWith(concFormula, resolver);

    // Index the per-day table by CLASS level (paladin/ranger CL = class level - 3).
    const tableRow = caster.autoSlots
      ? caster.spellsPerDayTable?.[String(caster.classLevel ?? cl)]
      : undefined;

    const slots: ComputedSpellSlots[] = [];
    for (let lvl = 0; lvl <= 9; lvl++) {
      const key = String(lvl);
      const manual = caster.spellsPerDay[key];
      // "Access" = the level appears in the table row (even at 0 base, e.g. paladin L4),
      // which is what grants ability bonus spells — not whether base > 0.
      const hasAccess = !!tableRow && Object.prototype.hasOwnProperty.call(tableRow, key);
      const base = caster.autoSlots ? tableRow?.[key] ?? 0 : manual?.total ?? 0;
      const bonus = caster.autoSlots
        ? hasAccess
          ? bonusSpellsForLevel(abilityMod, lvl)
          : 0
        : manual?.bonus ?? 0;
      const total = base + bonus;
      // Only prepared/spellbook casters have a prepared loadout; spontaneous casters
      // ignore preparedSpells entirely (so leftover entries after a type switch don't
      // surface phantom slots) and track usage per level slot instead.
      const preparedAtLevel = isPrepared
        ? character.spellcasting.preparedSpells.filter(
            (s) =>
              (s.casterId === caster.id || (!s.casterId && caster.id === solePreparedId)) &&
              // Clamp into the visible 0-9 range so an out-of-range (metamagic) level still surfaces.
              Math.min(9, Math.max(0, s.effectiveLevel ?? s.level)) === lvl,
          )
        : [];
      const prepared = preparedAtLevel.reduce((a, s) => a + (s.prepared ?? 1), 0);
      const used = isPrepared
        ? preparedAtLevel.reduce((a, s) => a + (s.used ?? 0), 0)
        : manual?.used ?? 0;
      if (total <= 0 && used <= 0 && prepared <= 0) continue;

      // @{spellLevel} is injected per level; a custom saveDcFormula should reference it
      // (e.g. "10 + @{spellLevel} + @{abilities.cha.mod}") or the DC won't scale by level.
      resolver.local = { casterLevel: cl, spellLevel: lvl };
      const dcFormula = caster.saveDcFormula?.trim()
        ? caster.saveDcFormula
        : `10 + @{spellLevel} + @{abilities.${ability}.mod}`;
      const dc = evalWith(dcFormula, resolver).value;

      slots.push({ level: lvl, base, bonus, total, used, remaining: Math.max(0, total - used), prepared, dc });
    }
    resolver.local = {};

    out.push({
      casterId: caster.id,
      className: caster.className,
      casterType: caster.casterType,
      castingAbility: ability,
      casterLevel: cl,
      concentration,
      slots,
    });
  }
  return out;
}

export function computeCharacter(character: PathForgeCharacterV1): ComputedCharacter {
  // Resolve formula-valued buff/automation effects against a base resolver
  // (character base stats, no buff-derived modifiers) to avoid circular deps,
  // then build the full index with those values resolved.
  const baseResolver = new CharacterResolver(character, computeAbilities(character), new Map() as ModifierIndex);
  const index = buildModifierIndex(character, baseResolver);
  const abilities = computeAbilities(character, index);
  const resolver = new CharacterResolver(character, abilities, index);

  const ac = character.defenses.armorClass.formulas;
  const saves = character.defenses.savingThrows;

  // Apply the equipped-armor Max Dex cap to the Dex-bearing AC values. Inject @{ac.maxDexPenalty}
  // when a formula counts Dex but predates the cap (older sheets) — new sheets already include it,
  // and a formula with no Dex (e.g. flat-footed) is left alone since there is nothing to cap.
  const withMaxDex = (f: string) =>
    f.includes("@{ac.maxDexPenalty}") || !f.includes("@{abilities.dex.mod}")
      ? f
      : `${f} + @{ac.maxDexPenalty}`;

  const armorClass = {
    total: evalWith(withMaxDex(ac.total), resolver, overrideFor(character, "defenses.armorClass.total")),
    touch: evalWith(withMaxDex(ac.touch), resolver, overrideFor(character, "defenses.armorClass.touch")),
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
  // Total armor check penalty from equipped armor/shields, applied to ACP-affected skills (Climb,
  // Swim, Stealth, …). Honors the sheet-wide toggle, and uses the magnitude so a sheet that stores
  // ACP as a negative ("-3", the common PF1e convention) still subtracts rather than adds.
  const acpApplies = character.skills.settings.armorCheckPenaltyApplies !== false;
  const equippedAcp = acpApplies
    ? allInventory(character)
        .filter((i) => i.equipped && typeof i.armorCheckPenalty === "number")
        .reduce((sum, i) => sum + Math.abs(i.armorCheckPenalty ?? 0), 0)
    : 0;
  for (const skill of character.skills.list) {
    const abilityMod = abilities[skill.ability]?.modifier ?? 0;
    const classSkillBonus = skill.classSkill && skill.ranks > 0 ? classBonusDefault : 0;
    const miscMods: IndexedMod[] = [
      ...skill.misc
        .map((m) => modifierEntryToMod(skill.label, m))
        .filter((m): m is IndexedMod => m !== null),
      ...(index.get(`skill.${skill.key}`) ?? []),
      ...(index.get("skill.all") ?? []),
    ];
    const miscTotal = applyStacking(miscMods).total;
    resolver.local = {
      ranks: skill.ranks,
      abilityMod,
      classSkillBonus,
      armorCheckPenalty: skill.armorCheckPenalty ? -equippedAcp : 0,
      misc: miscTotal,
    };
    // Skill rows persist their own formula (the factory seeds one per skill at create time), so
    // sheets created before ACP support stored a formula WITHOUT @{armorCheckPenalty} — the term
    // would never reach them. Inject it when an ACP-affected skill's stored formula omits it
    // (new sheets already include it → no-op), so ACP applies to existing and new characters alike.
    let formula =
      skill.formula ?? "@{ranks} + @{abilityMod} + @{classSkillBonus} + @{armorCheckPenalty} + @{misc}";
    if (skill.armorCheckPenalty && !formula.includes("@{armorCheckPenalty}")) {
      formula = `${formula} + @{armorCheckPenalty}`;
    }
    skills[skill.key] = evalWith(formula, resolver);
  }
  resolver.local = {};

  // Speed: base land speed (parsed from the display string) + stacked speed modifiers.
  const speedBase = parseLeadingInt(character.combat.speed.base);
  const speedBonus = applyStacking(index.get("speed") ?? []).total;

  // Individual attack lines: resolve each attack's to-hit formula; damage dice
  // are presentation-only and passed through untouched.
  const manualAttacks: ComputedAttack[] = character.combat.attacks
    .filter((a) => a.enabled !== false)
    .map((a) => {
      const r = a.attackFormula ? evaluate(a.attackFormula, resolver) : null;
      return {
        id: a.id,
        name: a.name,
        attackType: a.attackType,
        attackBonus: r ? r.value : 0,
        damage: a.damageFormula,
        damageType: a.damageType,
        critRange: a.critRange,
        critMultiplier: a.critMultiplier,
        range: a.range,
        warnings: r?.warnings ?? [],
      };
    });

  // Equipped weapons with stats generate a computed attack alongside the manual ones.
  const sizeMods = getSizeModifiers(character.identity.size);
  const babTotal = num(character.combat.bab.total);
  const weaponAttacks: ComputedAttack[] = allInventory(character)
    .filter((i) => i.equipped && i.weapon)
    .map((i) => {
      const w = i.weapon!;
      const atkMod = abilities[w.attackAbility]?.modifier ?? 0;
      const broad = stackTotal([
        ...(index.get(w.ranged ? "attack.ranged" : "attack.melee") ?? []),
        ...(index.get("attack.all") ?? []),
      ]);
      const attackBonus = babTotal + atkMod + sizeMods.attackMod + w.enhancement + broad;
      let dmgMod = w.enhancement;
      if (w.damageAbility !== "none") {
        dmgMod += weaponDamageMod(abilities[w.damageAbility]?.modifier ?? 0, w.handed);
      }
      const damage = w.damageDice
        ? `${w.damageDice}${dmgMod !== 0 ? signed(dmgMod) : ""}`
        : dmgMod !== 0
          ? signed(dmgMod)
          : undefined;
      return {
        // Reserved sentinel prefix so a generated weapon attack can never collide with a free-form
        // manual attack id (which would shadow the manual row in the combat editor's lookup).
        id: `pf:weapon:${i.id}`,
        name: i.name,
        attackType: w.ranged ? "ranged" : "melee",
        attackBonus,
        damage,
        damageType: w.damageType,
        critRange: w.critRange,
        critMultiplier: w.critMultiplier,
        range: w.range,
        warnings: [],
      };
    });

  const attacks: ComputedAttack[] = [...manualAttacks, ...weaponAttacks];

  const spellcasting = computeSpellcasting(character, abilities, resolver);
  resolver.local = {};

  return {
    abilities,
    armorClass,
    saves: savesComputed,
    initiative,
    attackBonuses,
    attacks,
    skills,
    spellcasting,
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
      spells: spellcasting.length
        ? {
            casterCount: spellcasting.length,
            highestSpellLevel: Math.max(
              0,
              ...spellcasting.flatMap((sc) => sc.slots.filter((s) => s.total > 0).map((s) => s.level)),
            ),
            totalSlots: spellcasting.reduce((a, sc) => a + sc.slots.reduce((b, s) => b + s.total, 0), 0),
            usedSlots: spellcasting.reduce((a, sc) => a + sc.slots.reduce((b, s) => b + s.used, 0), 0),
          }
        : undefined,
    },
  };
}
