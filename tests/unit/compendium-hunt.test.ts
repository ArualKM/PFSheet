import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import { mythweaversJsonAdapter } from "@pathforge/importers";
import { huntCompendium, type CompendiumIndex } from "@/lib/character/compendium-hunt";

const lc = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function makeIndex(opts: {
  talents?: Array<{ name: string; sphere: string; system: string }>;
  spheres?: Array<{ name: string; system: string }>;
  spells?: string[];
}): CompendiumIndex {
  const talents: CompendiumIndex["talents"] = new Map();
  for (const t of opts.talents ?? [])
    talents.set(lc(t.name), { id: `t-${lc(t.name)}`, talentName: t.name, sphereName: t.sphere, system: t.system, category: "Base Talent" });
  const spheres: CompendiumIndex["spheres"] = new Map();
  for (const s of opts.spheres ?? []) spheres.set(lc(s.name), { id: `s-${lc(s.name)}`, name: s.name, system: s.system });
  const spells: CompendiumIndex["spells"] = new Map();
  for (const n of opts.spells ?? []) spells.set(lc(n), { id: `sp-${lc(n)}`, name: n });
  return { talents, spheres, spells };
}

describe("compendium hunt", () => {
  it("links sphere talents + a spell + enables both modules (synthetic)", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.spellcasting.knownSpells.push(
      { id: "k1", name: "2[Monk]. Mass Teleport [mass]", level: 2 }, // sphere talent (Warp/Magic)
      { id: "k2", name: "Fireball", level: 3 }, // real spell
    );
    c.feats.list.push(
      { id: "f1", name: "Lurker", tags: [], automation: [], gmStatus: "unreviewed" }, // mis-filed Combat talent
      { id: "f2", name: "Power Attack", tags: [], automation: [], gmStatus: "unreviewed" }, // real feat — stays
    );
    const index = makeIndex({
      talents: [
        { name: "Mass Teleport", sphere: "Warp", system: "Magic" },
        { name: "Lurker", sphere: "Scout", system: "Combat" },
      ],
      spells: ["Fireball"],
    });

    const report = huntCompendium(c, index);

    expect(report.talentsLinked).toBe(2);
    expect(report.spellsLinked).toBe(1);
    expect(report.modulesEnabled.sort()).toEqual(["spheres_of_might", "spheres_of_power"]);
    // Talents moved out of their slots, real entries stay.
    expect(c.spellcasting.knownSpells.map((s) => s.name)).toEqual(["Fireball"]);
    expect(c.feats.list.map((f) => f.name)).toEqual(["Power Attack"]);
    // Linked to the compendium + spheres detected.
    expect(c.spheres!.talents.map((t) => t.talentName).sort()).toEqual(["Lurker", "Mass Teleport"]);
    expect(c.spheres!.spheres.map((s) => s.name).sort()).toEqual(["Scout", "Warp"]);
    expect(c.spellcasting.knownSpells[0]!.compendiumId).toBe("sp-fireball");
  });

  it("a real spell that shares a talent name stays a spell (no data loss)", () => {
    // 37 sphere-talent names exactly equal real spell names (Scrying, Resurrection, …); a memorized
    // spell must NOT be re-filed as a talent or wrongly enable Spheres.
    const c = createDefaultCharacter({ name: "Wizard" });
    c.spellcasting.knownSpells.push({ id: "k1", name: "Resurrection", level: 7 });
    const index = makeIndex({
      talents: [{ name: "Resurrection", sphere: "Life", system: "Magic" }],
      spells: ["Resurrection"],
    });

    const report = huntCompendium(c, index);

    expect(report.talentsLinked).toBe(0);
    expect(report.modulesEnabled).toEqual([]);
    expect(c.spellcasting.knownSpells.map((s) => s.name)).toEqual(["Resurrection"]);
    expect(c.spellcasting.knownSpells[0]!.compendiumId).toBe("sp-resurrection");
    expect(c.spheres?.talents.length ?? 0).toBe(0);
  });

  it("hunts the real Anise Myth-Weavers sheet", async () => {
    const json = JSON.parse(readFileSync(resolve(process.cwd(), "docs/ASOS_Redux_1_Anise.json"), "utf8"));
    const draft = await mythweaversJsonAdapter.normalize({
      sourceType: "mythweavers_json",
      raw: json,
      sourceMetadata: {},
    });
    const c = draft.character as PathForgeCharacterV1;

    // Index of talents confirmed present in both the sheet and the live compendium.
    const index = makeIndex({
      talents: [
        { name: "Pouncing Teleport", sphere: "Warp", system: "Magic" },
        { name: "Distant Teleport", sphere: "Warp", system: "Magic" },
        { name: "Unwilling Teleport", sphere: "Warp", system: "Magic" },
        { name: "Mass Teleport", sphere: "Warp", system: "Magic" },
        { name: "Unseeing Teleport", sphere: "Warp", system: "Magic" },
        { name: "Improved Haste", sphere: "Time", system: "Magic" },
        { name: "Weave The Fates", sphere: "Fate", system: "Magic" },
      ],
    });

    const report = huntCompendium(c, index);

    expect(report.talentsLinked).toBeGreaterThanOrEqual(6);
    expect(report.modulesEnabled).toContain("spheres_of_power");
    const spheres = c.spheres!.spheres.map((s) => s.name);
    expect(spheres).toEqual(expect.arrayContaining(["Warp", "Time", "Fate"]));
    // The matched talents were pulled out of the spell slots.
    const remaining = c.spellcasting.knownSpells.map((s) => s.name.toLowerCase());
    expect(remaining.some((n) => n.includes("pouncing teleport"))).toBe(false);
    // Every linked talent carries a compendiumId.
    expect(c.spheres!.talents.every((t) => Boolean(t.compendiumId))).toBe(true);
  });
});
