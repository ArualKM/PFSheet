import type { PathForgeCharacterV1 } from "@pathforge/schema";
import type { ExportAdapter, ExportContext, ExportResult } from "./index";

/**
 * §13.2 FoundryVTT PF1e Actor JSON export — best-effort. Produces an actor in the
 * modern (`system`) shape with `flags.pathforge` provenance. Round-trip is NOT
 * promised: buffs/effects, automation, and exact item mechanics are simplified, so
 * the result lists its known limitations as warnings.
 */
const CANON_TO_FOUNDRY_SKILL: Record<string, string> = Object.fromEntries(
  // Inverse of the importer's map; covers the standard 35 skills.
  [
    ["acrobatics", "acr"],
    ["appraise", "apr"],
    ["bluff", "blf"],
    ["climb", "clm"],
    ["craft", "crf"],
    ["diplomacy", "dip"],
    ["disable_device", "dev"],
    ["disguise", "dis"],
    ["escape_artist", "esc"],
    ["fly", "fly"],
    ["handle_animal", "han"],
    ["heal", "hea"],
    ["intimidate", "int"],
    ["knowledge_arcana", "kar"],
    ["knowledge_dungeoneering", "kdu"],
    ["knowledge_engineering", "ken"],
    ["knowledge_geography", "kge"],
    ["knowledge_history", "khi"],
    ["knowledge_local", "klo"],
    ["knowledge_nature", "kna"],
    ["knowledge_nobility", "kno"],
    ["knowledge_planes", "kpl"],
    ["knowledge_religion", "kre"],
    ["linguistics", "lin"],
    ["perception", "per"],
    ["perform", "prf"],
    ["profession", "pro"],
    ["ride", "rid"],
    ["sense_motive", "sen"],
    ["sleight_of_hand", "slt"],
    ["spellcraft", "spl"],
    ["stealth", "ste"],
    ["survival", "sur"],
    ["swim", "swm"],
    ["use_magic_device", "umd"],
  ],
);

const SIZE_TO_FOUNDRY: Record<string, string> = {
  fine: "fine",
  diminutive: "dim",
  tiny: "tiny",
  small: "sm",
  medium: "med",
  large: "lg",
  huge: "huge",
  gargantuan: "grg",
  colossal: "col",
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function parseLeadingInt(v: unknown): number {
  const m = String(v ?? "").match(/-?\d+/);
  return m ? Number.parseInt(m[0], 10) : 0;
}
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "character";
}

function buildActor(character: PathForgeCharacterV1, summary: Record<string, unknown>, meta: { characterId?: string; exportedAt?: string }) {
  const hp = (summary.hp ?? {}) as { current?: number; max?: number; temp?: number };

  const abilities: Record<string, { value: number }> = {};
  for (const k of ["str", "dex", "con", "int", "wis", "cha"] as const) {
    abilities[k] = { value: num(character.abilities.primary[k]?.score, 10) };
  }

  const skills: Record<string, { rank: number; ability: string; cs: boolean }> = {};
  for (const s of character.skills.list) {
    const code = CANON_TO_FOUNDRY_SKILL[s.key];
    if (!code) continue; // custom/3pp skills (lore/artistry) have no Foundry key
    // Export the EFFECTIVE key ability (per-skill override wins) so Foundry computes the same
    // total and a round-trip re-import lands on the swapped ability.
    const eff = (s.abilityOverride ?? "").trim().toLowerCase() || s.ability || "int";
    skills[code] = { rank: num(s.ranks), ability: eff, cs: Boolean(s.classSkill) };
  }

  // Per-save key-ability override (SaveEntry.abilityKey) — only the six real ability keys are
  // meaningful to Foundry; anything else falls back to the PF1e default.
  const saveAbility = (key: "fortitude" | "reflex" | "will", def: string): string => {
    const ov = (character.defenses.savingThrows[key].abilityKey ?? "").trim().toLowerCase();
    return ["str", "dex", "con", "int", "wis", "cha"].includes(ov) ? ov : def;
  };

  const items: Array<Record<string, unknown>> = [];
  for (const c of character.identity.classes) {
    items.push({ name: c.name, type: "class", system: { level: num(c.level), tag: "", subType: "base" } });
  }
  for (const f of character.feats.list) {
    items.push({ name: f.name, type: "feat", system: { subType: f.type ?? "feat" } });
  }
  for (const sp of character.spellcasting.knownSpells) {
    items.push({ name: sp.name, type: "spell", system: { level: num(sp.level), school: sp.school ?? "" } });
  }
  for (const b of character.buffs.active) {
    items.push({ name: b.name, type: "buff", system: { active: Boolean(b.enabled), subType: "misc" } });
  }
  for (const atk of character.combat.attacks) {
    items.push({
      name: atk.name,
      type: "weapon",
      system: {
        actions: [{ actionType: atk.attackType === "ranged" ? "rwak" : "mwak", damage: { parts: atk.damageFormula ? [{ formula: atk.damageFormula, types: atk.damageType ? [atk.damageType] : [] }] : [] } }],
      },
    });
  }

  return {
    name: character.identity.name,
    type: "character",
    img: character.profile.portraitUrl ?? "icons/svg/mystery-man.svg",
    system: {
      abilities,
      attributes: {
        hp: { value: num(hp.current, num(character.health.currentHp)), max: num(hp.max, num(character.health.maxHp)), temp: num(hp.temp) },
        savingThrows: {
          fort: { base: num(character.defenses.savingThrows.fortitude.base), ability: saveAbility("fortitude", "con") },
          ref: { base: num(character.defenses.savingThrows.reflex.base), ability: saveAbility("reflex", "dex") },
          will: { base: num(character.defenses.savingThrows.will.base), ability: saveAbility("will", "wis") },
        },
        bab: { total: num(parseLeadingInt(character.combat.bab.total)) },
        init: { value: 0, ability: "dex" },
        speed: { land: { base: parseLeadingInt(character.combat.speed.base) } },
      },
      details: {
        alignment: character.identity.alignment ?? "",
        deity: character.identity.deity ?? "",
        gender: character.identity.gender ?? "",
        age: character.identity.age ?? "",
        height: character.identity.height ?? "",
        weight: character.identity.weight ?? "",
        biography: { value: character.profile.backstory ?? "" },
      },
      traits: {
        size: SIZE_TO_FOUNDRY[(character.identity.size ?? "medium").toLowerCase()] ?? "med",
        languages: character.languages.known,
      },
      skills,
      currency: {
        pp: num(character.wealth.pp),
        gp: num(character.wealth.gp),
        sp: num(character.wealth.sp),
        cp: num(character.wealth.cp),
      },
    },
    items,
    effects: [],
    prototypeToken: { name: character.identity.name },
    flags: {
      pathforge: {
        source: "PathForge",
        characterId: meta.characterId ?? null,
        exportedAt: meta.exportedAt ?? null,
        schemaVersion: character.schemaVersion,
        adapterVersion: "foundry-pf1-export-v1",
      },
    },
  };
}

export const foundryPf1ActorJsonExporter: ExportAdapter = {
  key: "foundry_pf1_actor_json",
  label: "Foundry VTT PF1e Actor JSON",
  contentType: "application/json",

  async run(ctx: ExportContext): Promise<ExportResult> {
    const actor = buildActor(ctx.character, ctx.computedSummary ?? {}, {
      characterId: ctx.characterId,
      exportedAt: ctx.exportedAt,
    });
    return {
      type: "foundry_pf1_actor_json",
      contentType: "application/json",
      filename: `fvtt-Actor-${slugify(ctx.character.identity.name)}.json`,
      text: JSON.stringify(actor, null, 2),
      warnings: [
        "Best-effort export for the Foundry pf1 system (v10+/v11). Round-trip is not guaranteed.",
        "Buffs/effects, automation, archetypes, and exact item mechanics are simplified — review after importing.",
        "Multiclass is exported as separate class items at their PathForge levels; verify BAB/save progression in Foundry.",
      ],
    };
  },
};
