import {
  createDefaultCharacter,
  DEFAULT_SKILLS,
  type BonusType,
  type ModifierEntry,
  type AttackEntry,
  type SpellcasterEntry,
} from "@pathforge/schema";
import type {
  ImportAdapter,
  ImportInput,
  DetectionResult,
  ParsedImport,
  NormalizedCharacterDraft,
  ImportValidationResult,
  ImportWarning,
} from "./index";

/**
 * §12.7 FoundryVTT PF1e (the "pf1" system) Actor JSON import. Two shapes exist:
 *  - MODERN (system v10+): root key `system`, PERSISTED-ONLY — derived totals
 *    (AC, BAB, save totals, HP max, level) are computed at runtime and absent from
 *    the file, so they're recomputed here from the `items[]` (class progression).
 *  - LEGACY (≤ v9): root key `data`, fully-prepared — totals are present and used
 *    directly when available.
 * Abilities are stored as BASE scores (item enhancement bonuses live in item change
 * effects, which aren't replayed), so imported scores/derived values are best-effort
 * and flagged. Mythic (a class with subType "mythic") and Spheres of Power
 * (flags["pf1-pow"]) are detected and surfaced as optional-rule modules. Nothing is
 * silently discarded — unmapped skills/items/flags are preserved under
 * metadata.unmapped with warnings.
 */
type Json = Record<string, unknown>;

/** Foundry 3-letter skill keys → canonical PathForge skill keys. */
const FOUNDRY_SKILL_MAP: Record<string, string> = {
  acr: "acrobatics",
  apr: "appraise",
  blf: "bluff",
  clm: "climb",
  crf: "craft",
  dip: "diplomacy",
  dev: "disable_device",
  dis: "disguise",
  esc: "escape_artist",
  fly: "fly",
  han: "handle_animal",
  hea: "heal",
  int: "intimidate",
  kar: "knowledge_arcana",
  kdu: "knowledge_dungeoneering",
  ken: "knowledge_engineering",
  kge: "knowledge_geography",
  khi: "knowledge_history",
  klo: "knowledge_local",
  kna: "knowledge_nature",
  kno: "knowledge_nobility",
  kpl: "knowledge_planes",
  kre: "knowledge_religion",
  lin: "linguistics",
  per: "perception",
  prf: "perform",
  pro: "profession",
  rid: "ride",
  sen: "sense_motive",
  slt: "sleight_of_hand",
  spl: "spellcraft",
  ste: "stealth",
  sur: "survival",
  swm: "swim",
  umd: "use_magic_device",
  // art (Artistry) + lor (Lore) are 3pp/optional skills with no canonical key.
};

const SIZE_MAP: Record<string, string> = {
  fine: "Fine",
  dim: "Diminutive",
  tiny: "Tiny",
  sm: "Small",
  med: "Medium",
  lg: "Large",
  huge: "Huge",
  grg: "Gargantuan",
  col: "Colossal",
};

const ALIGNMENT_MAP: Record<string, string> = {
  lg: "Lawful Good",
  ng: "Neutral Good",
  cg: "Chaotic Good",
  ln: "Lawful Neutral",
  n: "True Neutral",
  tn: "True Neutral",
  cn: "Chaotic Neutral",
  le: "Lawful Evil",
  ne: "Neutral Evil",
  ce: "Chaotic Evil",
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
function babRate(prog: unknown): number {
  return prog === "high" ? 1 : prog === "med" ? 0.75 : prog === "low" ? 0.5 : 0;
}
function saveBaseFor(prog: unknown, level: number): number {
  if (prog === "high") return 2 + Math.floor(level / 2);
  if (prog === "low") return Math.floor(level / 3);
  return 0;
}

function getActor(input: ImportInput): Json | undefined {
  let json = input.json;
  if (json === undefined && input.text) {
    try {
      json = JSON.parse(input.text);
    } catch {
      return undefined;
    }
  }
  if (!json || typeof json !== "object") return undefined;
  return json as Json;
}

function isFoundryActor(actor: Json | undefined): actor is Json {
  if (!actor) return false;
  const hasBlock = !!actor.system || !!actor.data;
  const sysId =
    (actor._stats as Json | undefined)?.systemId ??
    ((actor.flags as Json | undefined)?.exportSource as Json | undefined)?.system;
  // A non-pf1 systemId means another game system (dnd5e, pf2e…) — don't claim it.
  if (typeof sysId === "string" && sysId !== "pf1") return false;
  const isPf1 = sysId === "pf1" || !!(actor.flags as Json | undefined)?.pf1;
  return Boolean(actor.type && hasBlock && (isPf1 || Array.isArray(actor.items)));
}

/** Foundry change-effect bonus types → PathForge bonus types. */
const FOUNDRY_BONUS_TYPE: Record<string, BonusType> = {
  enh: "enhancement",
  enhancement: "enhancement",
  luck: "luck",
  morale: "morale",
  dodge: "dodge",
  competence: "competence",
  circumstance: "circumstance",
  insight: "insight",
  sacred: "sacred",
  profane: "profane",
  deflection: "deflection",
  natural: "natural_armor",
  naturalArmor: "natural_armor",
  size: "size",
  racial: "racial",
  trait: "trait",
  alchemical: "alchemical",
  resistance: "resistance",
  inherent: "inherent",
  untyped: "untyped",
};

/** Whether a value carries actual data (non-empty, recursively). */
function hasData(v: unknown): boolean {
  if (v == null || v === "" || v === false || v === 0) return false;
  if (Array.isArray(v)) return v.some(hasData);
  if (typeof v === "object") return Object.values(v).some(hasData);
  return true;
}

function normalizeFoundry(actor: Json): NormalizedCharacterDraft {
  const warnings: ImportWarning[] = [];
  const warn = (code: string, message: string) => warnings.push({ code, message });
  const unmapped: Record<string, unknown> = {};

  const modern = !!actor.system;
  const sys = (actor.system ?? actor.data ?? {}) as Json;
  // Guard against null/non-object array elements so a malformed file degrades
  // gracefully instead of throwing out of the whole pipeline.
  const items = (Array.isArray(actor.items) ? actor.items : []).filter(
    (it): it is Json => !!it && typeof it === "object",
  );

  let idc = 0;
  const id = (p: string) => `fvtt-${p}-${idc++}`;
  const mod = (label: string, value: number, bonusType?: BonusType): ModifierEntry => ({
    id: id("mod"),
    label,
    value,
    bonusType,
    enabled: true,
  });

  const name = typeof actor.name === "string" && actor.name.trim() ? actor.name.trim() : "Imported Character";
  const character = createDefaultCharacter({ name });
  character.metadata.importSource = "foundry_pf1_actor_json";

  if (actor.type !== "character") {
    warn("non_pc", `Imported a Foundry actor of type "${String(actor.type)}" — verify; non-PC shapes may map imperfectly.`);
  }
  if (modern) {
    warn("modern_persisted", "Modern Foundry export — totals (AC, BAB, saves, HP, level) were recomputed from class items. Verify them.");
  }

  // ── Abilities (BASE scores; item bonuses live in change effects, not replayed) ──
  const ABILS = ["str", "dex", "con", "int", "wis", "cha"] as const;
  const abilities = (sys.abilities ?? {}) as Record<string, Json>;
  for (const k of ABILS) {
    const v = num(abilities[k]?.value, 10);
    character.abilities.primary[k].score = v;
  }
  const conMod = abilityMod(num(abilities.con?.value, 10));
  warn("abilities_base", "Ability scores were imported as BASE values; equipment/effect bonuses weren't applied. Add them or re-enter effective scores.");

  // ── Race + identity ──────────────────────────────────────────────────────
  const raceItem = items.find((it) => it.type === "race");
  const raceSys = (raceItem?.system ?? raceItem?.data ?? {}) as Json;
  if (typeof raceItem?.name === "string") character.identity.race = raceItem.name;
  const sizeCode = (raceSys.size ?? (sys.traits as Json | undefined)?.size) as string | undefined;
  if (sizeCode) character.identity.size = SIZE_MAP[sizeCode] ?? sizeCode;

  const details = (sys.details ?? {}) as Json;
  const align = details.alignment as string | undefined;
  if (align) character.identity.alignment = ALIGNMENT_MAP[align] ?? align;
  for (const [foundryKey, set] of [
    ["deity", (v: string) => (character.identity.deity = v)],
    ["gender", (v: string) => (character.identity.gender = v)],
    ["age", (v: string) => (character.identity.age = v)],
    ["height", (v: string) => (character.identity.height = v)],
    ["weight", (v: string) => (character.identity.weight = v)],
  ] as const) {
    const v = details[foundryKey];
    if (typeof v === "string" && v.trim()) set(v.trim());
    else if (typeof v === "number") set(String(v));
  }
  const bio = (details.biography as Json | undefined)?.value;
  if (typeof bio === "string" && bio.trim()) character.profile.backstory = bio;

  // ── Classes → BAB / saves / HP / level / casters / Mythic ──────────────────
  const classItems = items.filter((it) => it.type === "class");
  const mythicClass = classItems.find((c) => ((c.system ?? c.data) as Json)?.subType === "mythic");

  let totalLevel = 0;
  let bab = 0;
  const saveBase = { fort: 0, ref: 0, will: 0 } as Record<"fort" | "ref" | "will", number>;
  let hpFromClasses = 0;

  for (const c of classItems) {
    const cs = (c.system ?? c.data ?? {}) as Json;
    const level = num(cs.level);
    hpFromClasses += num(cs.hp);
    const isMythic = cs.subType === "mythic";
    if (isMythic) continue;
    totalLevel += level;
    bab += Math.floor(level * babRate(cs.bab));
    const st = (cs.savingThrows ?? {}) as Record<string, Json>;
    saveBase.fort += saveBaseFor(st.fort?.value, level);
    saveBase.ref += saveBaseFor(st.ref?.value, level);
    saveBase.will += saveBaseFor(st.will?.value, level);
    character.identity.classes.push({ id: id("class"), name: String(c.name ?? "Class"), level });
    if (typeof c.name === "string" && /\|\||\//.test(c.name)) {
      warn("class_unsplit", `Class "${c.name}" looks multiclass — split it into structured classes with per-class levels.`);
    }
    // Spellcasting
    const casting = cs.casting as Json | undefined;
    if (casting) {
      const caster: SpellcasterEntry = {
        id: id("caster"),
        className: String(c.name ?? "Caster"),
        casterType: (["prepared", "spontaneous", "spellbook", "hybrid"].includes(String(casting.type)) ? casting.type : "prepared") as SpellcasterEntry["casterType"],
        casterLevel: level,
        concentrationFormula: "",
        castingAbility: typeof casting.ability === "string" ? casting.ability : "int",
        conditionalModifiers: [],
        spellsPerDay: {},
        bonusSpells: {},
        saveDcFormula: "",
      };
      character.spellcasting.casters.push(caster);
    }
  }
  // Legacy actors keep classes under data.classes (not items[]) and store level
  // directly; fall back to it when no class items contributed.
  if (totalLevel === 0 && !modern) totalLevel = num((details.level as Json | undefined)?.value);
  character.identity.totalLevel = totalLevel;

  // Mythic
  if (mythicClass) {
    character.rules.variants.mythic = true;
    const tier = num(((mythicClass.system ?? mythicClass.data) as Json)?.level);
    warn("mythic_detected", `Mythic detected (${String(mythicClass.name)}, tier ${tier}) — enabled the Mythic module.`);
  }

  // BAB (modern recompute; legacy total if present)
  const legacyBab = (sys.attributes as Json | undefined)?.bab as Json | undefined;
  character.combat.bab.total = num(legacyBab?.total, bab);

  // Saves: set base from class progression + the persisted manual base; KEEP the
  // default formula so PathForge adds the ability mod + misc on top.
  const attrs = (sys.attributes ?? {}) as Json;
  const stRoot = (attrs.savingThrows ?? {}) as Record<string, Json>;
  const saveKey = { fort: "fortitude", ref: "reflex", will: "will" } as const;
  for (const k of ["fort", "ref", "will"] as const) {
    const save = character.defenses.savingThrows[saveKey[k]];
    const legacyTotal = stRoot[k]?.total;
    if (!modern && saveBase[k] === 0 && typeof legacyTotal === "number") {
      // Legacy fully-prepared total (classes weren't in items[]) — pin it as a
      // fixed value so the ability mod isn't added on top.
      save.base = legacyTotal;
      save.formula = String(legacyTotal);
    } else {
      save.base = saveBase[k] + num(stRoot[k]?.base);
    }
  }
  warn("saves_recomputed", "Save bases were computed from class progression; the ability mod is added by PathForge. Verify against the source.");

  // HP: class HP + Con per HD + manual offset (best-effort).
  const hpOffset = num((attrs.hp as Json | undefined)?.offset);
  const hpMax = num((attrs.hp as Json | undefined)?.max) || hpFromClasses + conMod * totalLevel + hpOffset;
  character.health.maxHp = Math.max(0, hpMax);
  character.health.currentHp = character.health.maxHp;
  warn("hp_recomputed", "Max HP was estimated from class HP + Con + offset. Verify it.");

  // ── AC: natural armor + worn armor/shield items ────────────────────────────
  const natural = num(attrs.naturalAC);
  if (natural !== 0) character.defenses.armorClass.conditionalModifiers.push(mod("Natural armor", natural, "natural_armor"));

  // ── Init + speed ───────────────────────────────────────────────────────────
  const initMisc = num((attrs.init as Json | undefined)?.value);
  if (initMisc !== 0) character.combat.initiative.conditionalModifiers.push(mod("Imported misc", initMisc, "untyped"));
  const speedLand = num((((attrs.speed as Json | undefined)?.land as Json | undefined)?.base), num(raceSys.speeds && (raceSys.speeds as Json).land));
  if (speedLand) character.combat.speed.base = `${speedLand} ft`;

  // ── Skills (incl. nested subSkills for Craft/Perform/Profession) ───────────
  const skills = (sys.skills ?? {}) as Record<string, Json>;
  const applySkill = (canonKey: string, rank: number, cs: boolean, ability: string | undefined, specialty?: string) => {
    const def = DEFAULT_SKILLS.find((d) => d.key === canonKey);
    const existing = !specialty ? character.skills.list.find((s) => s.key === canonKey) : undefined;
    if (existing) {
      if (rank > 0) existing.ranks = rank;
      if (cs) existing.classSkill = true;
      return;
    }
    if (rank <= 0 && !specialty && !cs) return;
    character.skills.list.push({
      id: id("skill"),
      key: canonKey,
      label: def?.label ?? canonKey,
      ability: ability ?? def?.ability ?? "int",
      ranks: Math.max(0, rank),
      misc: [],
      conditional: [],
      classSkill: cs,
      ...(specialty ? { specialty } : {}),
      ...(def?.trainedOnly ? { trainedOnly: true } : {}),
      ...(def?.armorCheckPenalty ? { armorCheckPenalty: true } : {}),
    });
  };
  for (const [fk, sv] of Object.entries(skills)) {
    const canon = FOUNDRY_SKILL_MAP[fk];
    const subSkills = sv?.subSkills as Record<string, Json> | undefined;
    if (subSkills && Object.keys(subSkills).length) {
      for (const [subKey, ss] of Object.entries(subSkills)) {
        if (!canon) {
          if (num(ss.rank) > 0 || ss.cs) unmapped[`skill.${fk}.${subKey}`] = ss; // Artistry/Lore etc.
          continue;
        }
        applySkill(canon, num(ss.rank), Boolean(ss.cs), typeof ss.ability === "string" ? ss.ability : undefined, typeof ss.name === "string" ? ss.name : undefined);
      }
      continue;
    }
    if (!canon) {
      if (num(sv?.rank) > 0) unmapped[`skill.${fk}`] = sv; // e.g. Artistry / Lore
      continue;
    }
    applySkill(canon, num(sv?.rank), Boolean(sv?.cs), typeof sv?.ability === "string" ? sv.ability : undefined);
  }

  // ── Items → feats / spells / buffs / attacks / inventory ───────────────────
  let unmappedItems = 0;
  let anyBuffEffects = false;
  for (const it of items) {
    const isys = (it.system ?? it.data ?? {}) as Json;
    const iname = String(it.name ?? "");
    switch (it.type) {
      case "class":
      case "race":
        break; // handled above
      case "feat":
        character.feats.list.push({ id: id("feat"), name: iname, tags: [], automation: [], gmStatus: "unreviewed", ...(typeof isys.subType === "string" ? { type: isys.subType } : {}) });
        break;
      case "spell":
        character.spellcasting.knownSpells.push({ id: id("spell"), name: iname, level: Math.max(0, Math.min(9, num(isys.level))), ...(typeof isys.school === "string" ? { school: isys.school } : {}) });
        break;
      case "buff": {
        // Translate the buff's mechanical change-effects so they aren't lost.
        const changes = (Array.isArray(isys.changes) ? isys.changes : []) as Json[];
        const effects = changes.map((ch) => {
          const op = String(ch.operator);
          const f = ch.formula;
          const typeKey = String(ch.type);
          return {
            id: id("eff"),
            target: typeof ch.target === "string" ? ch.target : "untyped",
            operation: (op === "set" ? "set" : op === "multiply" ? "multiply" : "add") as "add" | "set" | "multiply",
            value: typeof f === "number" || typeof f === "string" || typeof f === "boolean" ? f : 0,
            ...(FOUNDRY_BONUS_TYPE[typeKey] ? { bonusType: FOUNDRY_BONUS_TYPE[typeKey] } : {}),
          };
        });
        if (effects.length) anyBuffEffects = true;
        character.buffs.active.push({ id: id("buff"), name: iname, enabled: Boolean(isys.active), category: "custom", effects });
        break;
      }
      case "weapon":
      case "attack": {
        const actions = (Array.isArray(isys.actions) ? isys.actions : []) as Json[];
        const action = actions[0];
        const parts = ((action?.damage as Json | undefined)?.parts as Json[] | undefined) ?? [];
        const dmg = parts.map((p) => String(p.formula)).filter(Boolean).join(" + ");
        const dtypes = [
          ...new Set(parts.flatMap((p) => (Array.isArray(p.types) ? (p.types as unknown[]) : [])).map(String)),
        ];
        const ability = action?.ability as Json | undefined;
        const critRange = num(ability?.critRange, 20);
        const actionType = String(action?.actionType ?? "");
        const attackType: AttackEntry["attackType"] = /cman$/.test(actionType)
          ? "cmb"
          : actionType.startsWith("r")
            ? "ranged"
            : "melee";
        const attack: AttackEntry = {
          id: id("atk"),
          name: iname,
          attackType,
          enabled: true,
          showInCombat: true,
          conditionalModifiers: [],
          ...(dmg ? { damageFormula: dmg } : {}),
          ...(dtypes.length ? { damageType: dtypes.join(", ") } : {}),
          ...(critRange < 20 ? { critRange: `${critRange}-20` } : {}),
          ...(ability?.critMult ? { critMultiplier: `x${num(ability.critMult, 2)}` } : {}),
        };
        if (actions.length > 1) warn("multi_action", `"${iname}" had ${actions.length} actions; only the first was imported.`);
        character.combat.attacks.push(attack);
        break;
      }
      case "equipment": {
        const armor = isys.armor as Json | undefined;
        const acVal = num(armor?.value);
        const isShield = isys.subType === "shield";
        if (acVal !== 0) character.defenses.armorClass.conditionalModifiers.push(mod(iname, acVal, isShield ? "shield" : "armor"));
        character.inventory.armorAndShields.push({ id: id("eq"), name: iname, category: isShield ? "shield" : "armor", quantity: num(isys.quantity, 1), equipped: Boolean(isys.equipped), automation: [], modifiers: [], identified: true });
        break;
      }
      case "consumable":
      case "loot":
      case "container":
      case "implant":
      case "ammo":
        character.inventory.gear.push({ id: id("gear"), name: iname, category: "gear", quantity: num(isys.quantity, 1), equipped: Boolean(isys.equipped), automation: [], modifiers: [], identified: true });
        break;
      default:
        unmapped[`item.${String(it.type)}.${iname}#${unmappedItems}`] = { type: it.type, name: iname, system: isys };
        unmappedItems++;
    }
  }

  // ── Currency + languages ───────────────────────────────────────────────────
  const cur = (sys.currency ?? {}) as Json;
  character.wealth.pp = num(cur.pp);
  character.wealth.gp = num(cur.gp);
  character.wealth.sp = num(cur.sp);
  character.wealth.cp = num(cur.cp);
  const traits = (sys.traits ?? {}) as Json;
  const langs = traits.languages;
  const langList = Array.isArray(langs) ? langs : ((langs as Json | undefined)?.value as unknown[] | undefined);
  if (Array.isArray(langList)) character.languages.known = langList.map(String).filter(Boolean);

  // Preserve non-empty trait sub-objects (senses, DR, immunities, proficiencies).
  let anyTraits = false;
  for (const tk of ["senses", "dr", "eres", "cres", "regen", "fastHealing", "di", "dv", "ci", "weaponProf", "armorProf", "stature", "ageCategory"]) {
    if (hasData(traits[tk])) {
      unmapped[`traits.${tk}`] = traits[tk];
      anyTraits = true;
    }
  }
  if (anyTraits) warn("traits_preserved", "Senses / DR / immunities / proficiencies were preserved under metadata.unmapped — re-enter the ones you need.");
  if (anyBuffEffects) warn("buff_effects", "Buff mechanical effects were imported best-effort; verify their targets/values.");

  // ── Modules (Mythic handled above; Spheres via flags) ──────────────────────
  const flags = (actor.flags ?? {}) as Json;
  if (flags["pf1-pow"]) {
    character.rules.modules.push({ key: "spheres_of_power", enabled: true, settings: {}, fromCampaign: false });
    warn("spheres_detected", "Spheres of Power (flags.pf1-pow) detected — enabled the Spheres of Power module; verify sphere talents.");
  }

  // ── Lossless preservation ──────────────────────────────────────────────────
  if (unmappedItems) warn("items_unmapped", `${unmappedItems} item(s) of unmapped types were preserved under metadata.unmapped.`);
  unmapped.foundryFlags = Object.keys(flags);
  unmapped.systemVersion = (actor._stats as Json | undefined)?.systemVersion ?? (flags.exportSource as Json | undefined)?.systemVersion;
  warn("source_retained", "The full Foundry source is kept with the import job; mapped values are best-effort — review them.");
  character.metadata.unmapped = unmapped;

  return { character, unmapped, warnings };
}

export const foundryPf1ActorJsonAdapter: ImportAdapter = {
  key: "foundry_pf1_actor_json",
  label: "Foundry VTT PF1e Actor JSON",

  async detect(input: ImportInput): Promise<DetectionResult> {
    const actor = getActor(input);
    const matched = isFoundryActor(actor);
    return {
      matched,
      confidence: matched ? 0.9 : 0,
      sourceType: "foundry_pf1_actor_json",
      notes: matched ? [`Foundry pf1 actor (${actor?.system ? "modern" : "legacy"} shape).`] : undefined,
    };
  },

  async parse(input: ImportInput): Promise<ParsedImport> {
    const actor = getActor(input);
    return {
      sourceType: "foundry_pf1_actor_json",
      raw: actor,
      sourceMetadata: {
        filename: input.filename,
        systemVersion: (actor?._stats as Json | undefined)?.systemVersion,
        shape: actor?.system ? "modern" : "legacy",
      },
    };
  },

  async normalize(parsed: ParsedImport): Promise<NormalizedCharacterDraft> {
    const actor = parsed.raw as Json | undefined;
    if (!isFoundryActor(actor)) {
      return {
        character: createDefaultCharacter({ name: "Imported Character" }),
        unmapped: {},
        warnings: [{ code: "not_foundry", message: "Input didn't look like a Foundry pf1 actor." }],
      };
    }
    return normalizeFoundry(actor);
  },

  async validate(draft: NormalizedCharacterDraft): Promise<ImportValidationResult> {
    return { ok: true, warnings: draft.warnings, errors: [] };
  },
};
