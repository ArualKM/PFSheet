import {
  createDefaultCharacter,
  DEFAULT_SKILLS,
  type PathForgeCharacterV1,
  type BonusType,
  type ModifierEntry,
  type AttackEntry,
  type EquipmentItem,
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
import { str, toInt, parseLeadingInt, isRealValue } from "./util";

/**
 * §12.4 Myth-Weavers JSON import — best-effort, schema-sample driven. The MW PF1e
 * sheet is ONE flat key/value object with fixed numbered slots (`Skill01`…,
 * `FeatN`, `SpellN`, `GearN`, `WeaponN`, `LangN`) and `__txt_*` free-text areas.
 * Users heavily overload it: slots become section dividers ("##### Feats #####"),
 * skill rows become rank budgets (negative ranks), and text areas hold structured
 * prose unrelated to their label. So this adapter maps only what is unambiguous,
 * recognizes and skips the noise, and PRESERVES everything else (text areas +
 * unmapped slots) under metadata.unmapped + a labeled notes dump — never silently
 * discarding data. Imported abilities/saves are effective totals; the user
 * re-files prose and rebuilds formulas in PathForge afterward.
 */
type Mw = Record<string, unknown>;

const TEXT_LABELS: Record<string, string> = {
  __txt_char_traits: "Traits field",
  __txt_char_flaws: "Flaws field",
  __txt_text1: "Text area 1",
  __txt_text2: "Text area 2",
  __txt_char_enemies: "Enemies field",
  __txt_char_contacts: "Contacts field",
  __txt_Notes: "Notes field",
  __txt_statsummary: "Stat summary field",
  __txt_char_description: "Description field",
  __txt_char_personality: "Personality field",
  __txt_private_notes: "Private notes field",
  __txt_Cash: "Cash / ledger field",
};

function isMwObject(json: unknown): json is Mw {
  if (!json || typeof json !== "object") return false;
  const o = json as Mw;
  return "_meta_sheet_data_version" in o && ("Skill01Ab" in o || "Skill01" in o || ("Str" in o && "Dex" in o));
}

function getJson(input: ImportInput): unknown {
  if (input.json !== undefined) return input.json;
  if (input.text) {
    try {
      return JSON.parse(input.text);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Match a Myth-Weavers skill label to a canonical skill key (+ specialty). */
function matchSkill(name: string): { key: string; specialty?: string } | null {
  const lower = name.toLowerCase();
  const direct = DEFAULT_SKILLS.find((d) => d.label.toLowerCase() === lower);
  if (direct) return { key: direct.key };
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m && m[1] && m[2]) {
    const base = m[1].trim().toLowerCase();
    const repeatable = DEFAULT_SKILLS.find((d) => d.label.toLowerCase() === base && d.repeatable);
    if (repeatable) return { key: repeatable.key, specialty: m[2].trim() };
  }
  return null;
}

function normalizeMw(mw: Mw): NormalizedCharacterDraft {
  const warnings: ImportWarning[] = [];
  const warn = (code: string, message: string) => warnings.push({ code, message });
  const unmapped: Record<string, unknown> = {};
  const consumed = new Set<string>();
  const take = (k: string): string => {
    consumed.add(k);
    return str(mw[k]);
  };
  const skip = (...keys: string[]) => keys.forEach((k) => consumed.add(k));

  let idc = 0;
  const id = (p: string) => `mw-${p}-${idc++}`;

  // Factories — Zod's .default() makes these fields required in the inferred type.
  const mod = (label: string, value: number, bonusType?: BonusType): ModifierEntry => ({
    id: id("mod"),
    label,
    value,
    bonusType,
    enabled: true,
  });
  const equip = (name: string, category: EquipmentItem["category"], weight?: number): EquipmentItem => ({
    id: id("eq"),
    name,
    category,
    quantity: 1,
    equipped: false,
    automation: [],
    modifiers: [],
    identified: true,
    ...(weight !== undefined ? { weight } : {}),
  });

  const nameRaw = take("Name");
  const character = createDefaultCharacter({ name: isRealValue(nameRaw) ? nameRaw : "Imported Character" });
  character.metadata.importSource = "mythweavers_json";

  // ── Identity ──────────────────────────────────────────────────────────────
  const setIf = (real: string, apply: (v: string) => void) => {
    if (isRealValue(real)) apply(real);
  };
  setIf(take("Player"), (v) => (character.identity.playerName = v));
  setIf(take("Race"), (v) => (character.identity.race = v));
  setIf(take("Alignment"), (v) => (character.identity.alignment = v));
  setIf(take("Deity"), (v) => (character.identity.deity = v));
  const sizeRaw = take("Size");
  const sizeReal = isRealValue(sizeRaw);
  if (sizeReal) character.identity.size = sizeRaw;
  setIf(take("Gender"), (v) => (character.identity.gender = v));
  setIf(take("Age"), (v) => (character.identity.age = v));
  setIf(take("Height"), (v) => (character.identity.height = v));
  setIf(take("Weight"), (v) => (character.identity.weight = v));
  setIf(take("Eyes"), (v) => (character.profile.appearance.eyes = v));
  setIf(take("Hair"), (v) => (character.profile.appearance.hair = v));
  setIf(take("PicURL"), (v) => (character.profile.portraitUrl = v));

  // Level + Mythic detection ("20/MT10").
  const levelRaw = take("Level");
  const totalLevel = parseLeadingInt(levelRaw) ?? 0;
  character.identity.totalLevel = totalLevel;
  const mythicTier = levelRaw.match(/MT\s*(\d+)/i);
  if (mythicTier) {
    character.rules.variants.mythic = true;
    warn("mythic_detected", `Mythic Tier ${mythicTier[1]} detected — enabled the Mythic module; tier/path details are in the imported notes.`);
  }

  // Class line — imported as a single best-effort entry (often multiclass + 3pp).
  const classRaw = take("Class");
  if (isRealValue(classRaw)) {
    character.identity.classes.push({ id: id("class"), name: classRaw, level: totalLevel });
    if (/\|\||\//.test(classRaw)) {
      warn("class_unsplit", "The class line looks multiclass; it was imported as one class entry — split it into structured classes with per-class levels.");
    }
  }

  const campaign = take("Campaign");
  if (isRealValue(campaign)) unmapped["Campaign"] = campaign;

  // ── Abilities (effective totals) ───────────────────────────────────────────
  const abilityMap: Array<[string, keyof PathForgeCharacterV1["abilities"]["primary"]]> = [
    ["Str", "str"],
    ["Dex", "dex"],
    ["Con", "con"],
    ["Int", "int"],
    ["Wis", "wis"],
    ["Cha", "cha"],
  ];
  let setAnyAbility = false;
  for (const [mwKey, key] of abilityMap) {
    const score = toInt(take(mwKey));
    skip(`${mwKey}Mod`);
    if (score !== undefined) {
      character.abilities.primary[key].score = score;
      setAnyAbility = true;
    }
  }
  if (setAnyAbility) {
    warn("abilities_effective", "Ability scores were imported as effective totals (after items/buffs). Re-enter base scores + bonuses to make them dynamic.");
  }

  // ── Saves (imported as fixed totals) ───────────────────────────────────────
  const saveMap: Array<[string, "fortitude" | "reflex" | "will"]> = [
    ["Fort", "fortitude"],
    ["Reflex", "reflex"],
    ["Will", "will"],
  ];
  let setAnySave = false;
  for (const [mwKey, key] of saveMap) {
    const total = toInt(take(mwKey));
    for (const part of ["Base", "Ability", "Magic", "Misc", "Temp"]) {
      const pv = take(`${mwKey}${part}`);
      if (isRealValue(pv)) unmapped[`${mwKey}${part}`] = pv;
    }
    if (total !== undefined) {
      const save = character.defenses.savingThrows[key];
      save.base = total;
      // The engine computes saves from save.formula (not abilityKey), so pin the
      // formula to the imported total — otherwise the ability mod double-counts.
      save.formula = String(total);
      setAnySave = true;
    }
  }
  if (setAnySave) {
    warn("saves_fixed", "Saving throws were imported as fixed totals (their source breakdowns are preserved under unmapped). Rebuild save formulas to make them dynamic.");
  }

  // ── AC components → typed modifiers (Dex comes from the ability score) ───────
  const acMap: Array<[string, BonusType]> = [
    ["ACArmor", "armor"],
    ["ACShield", "shield"],
    ["ACNat", "natural_armor"],
    ["ACDodge", "dodge"],
    ["ACDeflect", "deflection"],
    ["ACMisc", "untyped"],
  ];
  for (const [mwKey, bonusType] of acMap) {
    const val = toInt(take(mwKey));
    if (val !== undefined && val !== 0) {
      character.defenses.armorClass.conditionalModifiers.push(mod(`Imported ${bonusType.replace("_", " ")}`, val, bonusType));
    }
  }
  // Size already feeds AC via identity.size; only use ACSize when no real Size was
  // imported, to avoid double-counting the size modifier.
  const acSize = toInt(take("ACSize"));
  if (!sizeReal && acSize !== undefined && acSize !== 0) {
    character.defenses.armorClass.conditionalModifiers.push(mod("Imported size", acSize, "size"));
  }
  skip("ACDex", "AC", "ACTouch", "ACFlat");

  // ── Initiative misc ────────────────────────────────────────────────────────
  const initMisc = toInt(take("InitMisc"));
  skip("InitDex", "Init");
  if (initMisc !== undefined && initMisc !== 0) {
    character.combat.initiative.conditionalModifiers.push(mod("Imported misc", initMisc, "untyped"));
  }

  // ── BAB ────────────────────────────────────────────────────────────────────
  const bab = parseLeadingInt(take("RABBase") || take("MABBase") || take("CMBBase"));
  if (bab !== undefined) character.combat.bab.total = bab;
  for (const k of [
    "RBAB", "MBAB", "CMB", "CMD", "FCMD", "RABDex", "RABStr", "RABSize", "RABMisc", "RABTemp",
    "MABStr", "MABSize", "MABMisc", "MABTemp", "CMBStr", "CMBSize", "CMBMisc", "CMBTemp",
  ]) {
    const v = take(k);
    // Preserve attack lines ("+34/+29/...") AND real numeric totals (CMD/FCMD/…);
    // only drop bare "0" sub-mods as noise.
    if (isRealValue(v) && v !== "0") unmapped[k] = v;
  }
  skip("LightLoad", "MediumLoad", "HeavyLoad", "LiftOverHead", "LiftOffGround", "LiftPushDrag",
    "totalweight", "total_ranks", "MaxRank", "MaxRankCC", "StrMod", "DexMod", "ConMod", "IntMod", "WisMod", "ChaMod");

  // ── HP + speed ─────────────────────────────────────────────────────────────
  const maxHp = parseLeadingInt(take("HP"));
  const curHp = parseLeadingInt(take("HPWounds"));
  if (maxHp !== undefined) character.health.maxHp = maxHp;
  character.health.currentHp = curHp ?? maxHp ?? 0;
  for (const k of ["HPHD", "HPSub", "DamageRed"]) {
    const v = take(k);
    if (isRealValue(v)) unmapped[k] = v;
  }
  const speed = take("Speed");
  if (isRealValue(speed)) character.combat.speed.base = /^\d+$/.test(speed) ? `${speed} ft` : speed;
  const casterLevel = take("CasterLevel");
  if (isRealValue(casterLevel)) unmapped["CasterLevel"] = casterLevel;

  // ── Skills ─────────────────────────────────────────────────────────────────
  for (let i = 1; i <= 60; i++) {
    const nn = String(i).padStart(2, "0");
    const nameKey = `Skill${nn}`;
    if (!(nameKey in mw)) continue;
    const name = take(nameKey);
    const ab = take(`Skill${nn}Ab`);
    const cc = take(`Skill${nn}CC`);
    const rankRaw = take(`Skill${nn}Rank`);
    const misc = toInt(take(`Skill${nn}MiscMod`));
    skip(`Skill${nn}AbMod`, `Skill${nn}ACP`, `Skill${nn}Mod`);
    const rank = toInt(rankRaw);
    const matched = isRealValue(name) ? matchSkill(name) : null;
    // Reject placeholders, dividers, budget trackers (negative ranks), and unknown
    // skill names — preserve those rows rather than inventing skills.
    if (!matched || (rank !== undefined && rank < 0)) {
      if (isRealValue(name)) unmapped[nameKey] = { name, ranks: rankRaw, ability: ab };
      continue;
    }
    const entry = character.skills.list.find((s) => s.key === matched.key);
    if (!entry) {
      // Repeatable skills (Craft/Perform/Profession) aren't in the default list —
      // synthesize an entry so their ranks/specialty/class-skill aren't lost.
      const hasData = (rank !== undefined && rank > 0) || Boolean(matched.specialty) || cc === "1" || (misc !== undefined && misc !== 0);
      if (!hasData) continue;
      const def = DEFAULT_SKILLS.find((d) => d.key === matched.key);
      character.skills.list.push({
        id: id("skill"),
        key: matched.key,
        label: def?.label ?? name,
        ability: def?.ability ?? (ab.toLowerCase() || "int"),
        ranks: rank !== undefined && rank > 0 ? rank : 0,
        misc: misc !== undefined && misc !== 0 ? [mod("Imported misc", misc, "untyped")] : [],
        conditional: [],
        classSkill: cc === "1",
        ...(matched.specialty ? { specialty: matched.specialty } : {}),
        ...(def?.trainedOnly ? { trainedOnly: true } : {}),
        ...(def?.armorCheckPenalty ? { armorCheckPenalty: true } : {}),
      });
      continue;
    }
    if (rank !== undefined && rank > 0) entry.ranks = rank;
    if (matched.specialty) entry.specialty = matched.specialty;
    if (cc === "1") entry.classSkill = true;
    if (misc !== undefined && misc !== 0) entry.misc.push(mod("Imported misc", misc, "untyped"));
  }

  // ── Feats / talents (overloaded slots; import non-divider rows) ─────────────
  let featCount = 0;
  for (const k of Object.keys(mw)) {
    if (!/^(Feat\d+|Featxtra\d*|Featxtrax\d+)$/.test(k)) continue;
    const v = take(k);
    if (!isRealValue(v)) continue;
    character.feats.list.push({ id: id("feat"), name: v, tags: [], automation: [], gmStatus: "unreviewed" });
    featCount++;
  }
  if (featCount) {
    warn("feats_mixed", `${featCount} feat/talent slots were imported as feats — many hold class features, talents, or notes. Review and re-file them.`);
  }

  // ── Spells / sphere talents ────────────────────────────────────────────────
  let spellCount = 0;
  let spheresSeen = false;
  for (const k of Object.keys(mw)) {
    const m = k.match(/^Spell(\d+)$/);
    if (!m) continue;
    skip(`Spell${m[1]}Cast`);
    const v = take(k);
    if (!isRealValue(v)) continue;
    if (/sphere/i.test(v)) spheresSeen = true;
    const level = Math.max(0, Math.min(9, parseLeadingInt(v) ?? 0));
    character.spellcasting.knownSpells.push({ id: id("spell"), name: v, level });
    spellCount++;
  }
  if (spellCount) warn("spells_imported", `${spellCount} spell slots were imported as known spells. Verify levels.`);
  if (spheresSeen) {
    warn("spheres_detected", "Spheres of Power/Might content was detected — enable the Spheres modules in Settings and re-file these as sphere talents.");
  }

  // ── Inventory: gear, weapons, armor, shield ────────────────────────────────
  for (let i = 1; i <= 50; i++) {
    const nn = String(i).padStart(2, "0");
    const gk = `Gear${nn}`;
    if (!(gk in mw)) continue;
    const name = take(gk);
    const weight = toInt(take(`Gear${nn}W`));
    const loc = take(`Gear${nn}01Loc`);
    if (!isRealValue(name)) {
      if (isRealValue(loc)) unmapped[`Gear${nn}01Loc`] = loc;
      continue;
    }
    const item = equip(name, "gear", weight);
    if (isRealValue(loc)) item.notes = `Slot: ${loc}`;
    character.inventory.gear.push(item);
  }

  for (let i = 1; i <= 4; i++) {
    const name = take(`Weapon${i}`);
    const ab = take(`Weapon${i}AB`);
    const dmg = take(`Weapon${i}Damage`);
    const crit = take(`Weapon${i}Crit`);
    const range = take(`Weapon${i}Range`);
    const ammo = take(`Weapon${i}Ammo`);
    const type = take(`Weapon${i}Type`);
    const special = take(`Weapon${i}Special`);
    skip(`Weapon${i}Weight`, `Weapon${i}Size`);
    if (!isRealValue(name)) continue;
    const critParts = crit.match(/^([\d-]+)\s*\/?\s*(x\d+)?/i);
    const noteBits = [
      isRealValue(ab) ? `Attack: ${ab}` : "",
      isRealValue(special) ? `Special: ${special}` : "",
      isRealValue(ammo) ? `Extra: ${ammo}` : "",
    ].filter(Boolean);
    const attack: AttackEntry = {
      id: id("atk"),
      name,
      attackType: "melee",
      enabled: true,
      showInCombat: true,
      conditionalModifiers: [],
      ...(isRealValue(dmg) ? { damageFormula: dmg } : {}),
      ...(isRealValue(type) ? { damageType: type } : {}),
      ...(critParts?.[1] ? { critRange: critParts[1] } : {}),
      ...(critParts?.[2] ? { critMultiplier: critParts[2] } : {}),
      ...(isRealValue(range) ? { range } : {}),
      ...(noteBits.length ? { notes: noteBits.join(" · ") } : {}),
    };
    character.combat.attacks.push(attack);
  }

  // Preserve the magic-item *Special prose (and type) into the item notes — it's
  // real data with no other home; if there's no item, keep it under unmapped.
  const pushArmorPiece = (
    nameKey: string,
    typeKey: string,
    specialKey: string,
    category: EquipmentItem["category"],
  ) => {
    const nm = take(nameKey);
    const type = take(typeKey);
    const special = take(specialKey);
    const notes = [isRealValue(type) ? type : "", isRealValue(special) ? special : ""].filter(Boolean).join(" · ");
    if (isRealValue(nm)) {
      const item = equip(nm, category);
      if (notes) item.notes = notes;
      character.inventory.armorAndShields.push(item);
    } else {
      if (isRealValue(special)) unmapped[specialKey] = special;
      if (isRealValue(type)) unmapped[typeKey] = type;
    }
  };
  pushArmorPiece("ArmorName", "ArmorType", "ArmorSpecial", "armor");
  skip("ArmorBonus", "ArmorWorn", "ArmorDex", "ArmorCheck", "ArmorSpeed", "ArmorSpell", "ArmorWeight", "Armor");
  pushArmorPiece("ShieldName", "ShieldType", "ShieldSpecial", "shield");
  skip("ShieldBonus", "ShieldWorn", "ShieldDex", "ShieldCheck", "ShieldSpeed", "ShieldSpell", "ShieldWeight");
  skip("Weapon3", "Weapon4");

  // ── Languages ──────────────────────────────────────────────────────────────
  for (let i = 1; i <= 20; i++) {
    const v = take(`Lang${i}`);
    if (isRealValue(v)) character.languages.known.push(v);
  }

  // ── Text areas → labeled notes dump (labels are unreliable; preserve all) ───
  let textDump = "";
  for (const k of Object.keys(mw)) {
    if (!k.startsWith("__txt_")) continue;
    const v = take(k);
    if (!isRealValue(v)) continue;
    textDump += `## ${TEXT_LABELS[k] ?? k}\n${v}\n\n`;
  }
  if (textDump) {
    character.notes.player =
      (character.notes.player ? `${character.notes.player}\n\n` : "") +
      `# Imported from Myth-Weavers\n\n${textDump.trim()}`;
    warn("text_preserved", "Myth-Weavers text areas were preserved as labeled notes — their field labels are unreliable, so re-file them into the proper sections.");
  }

  // ── Sweep: preserve every remaining real, unconsumed source field ──────────
  for (const [k, v] of Object.entries(mw)) {
    if (consumed.has(k)) continue;
    if (k.startsWith("_meta_")) continue;
    if (!isRealValue(v)) continue; // empty slot / template placeholder / divider — not data
    unmapped[k] = v;
  }
  if (Object.keys(unmapped).length) {
    character.metadata.unmapped = unmapped;
    warn("unmapped_preserved", `${Object.keys(unmapped).length} source fields couldn't be auto-mapped and were preserved under metadata.unmapped.`);
  }

  return { character, unmapped, warnings };
}

export const mythweaversJsonAdapter: ImportAdapter = {
  key: "mythweavers_json",
  label: "Myth-Weavers JSON",

  async detect(input: ImportInput): Promise<DetectionResult> {
    const json = getJson(input);
    const matched = isMwObject(json);
    return {
      matched,
      confidence: matched ? 0.95 : 0,
      sourceType: "mythweavers_json",
      notes: matched ? ["Myth-Weavers flat sheet object."] : undefined,
    };
  },

  async parse(input: ImportInput): Promise<ParsedImport> {
    const json = getJson(input);
    return {
      sourceType: "mythweavers_json",
      raw: json,
      sourceMetadata: {
        filename: input.filename,
        sheetDataVersion: isMwObject(json) ? json["_meta_sheet_data_version"] : undefined,
      },
    };
  },

  async normalize(parsed: ParsedImport): Promise<NormalizedCharacterDraft> {
    if (!isMwObject(parsed.raw)) {
      return {
        character: createDefaultCharacter({ name: "Imported Character" }),
        unmapped: {},
        warnings: [{ code: "not_mythweavers", message: "Input didn't look like a Myth-Weavers sheet." }],
      };
    }
    return normalizeMw(parsed.raw);
  },

  async validate(draft: NormalizedCharacterDraft): Promise<ImportValidationResult> {
    return { ok: true, warnings: draft.warnings, errors: [] };
  },
};
