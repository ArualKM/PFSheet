import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import {
  buildMasterCache,
  masterCacheEquals,
  parseAbilityScores,
  parseAttacks,
  parseNaturalArmor,
  parseSize,
  applyCompanionStatblock,
} from "@/lib/character/companion-sync";

describe("statblock parsing", () => {
  it("parses the compendium ability-score line", () => {
    expect(parseAbilityScores("Str 11, Dex 18, Con 9, Int 2, Wis 13, Cha 10")).toEqual({
      str: 11,
      dex: 18,
      con: 9,
      int: 2,
      wis: 13,
      cha: 10,
    });
  });

  it("parses natural armor, attacks, and size", () => {
    expect(parseNaturalArmor("+3 natural armor")).toBe(3);
    expect(parseNaturalArmor("touch 12")).toBe(0);
    expect(parseAttacks("bite (1d6 plus trip), 2 claws (1d3)")).toEqual([
      { name: "bite", damage: "1d6 plus trip" },
      { name: "2 claws", damage: "1d3" },
    ]);
    expect(parseSize("Size Medium; Speed 30 ft.")).toBe("medium");
    expect(parseSize(null)).toBe("medium");
  });

  it("applyCompanionStatblock fills the sheet and preserves the source text", () => {
    const sheet = createDefaultCharacter({ name: "Wolfy" });
    applyCompanionStatblock(sheet, {
      slug: "wolf",
      name: "Wolf",
      size: "Medium",
      speed: "50 ft.",
      ac: "+2 natural armor",
      attack: "bite (1d6 plus trip)",
      ability_scores: "Str 13, Dex 15, Con 15, Int 2, Wis 12, Cha 6",
      special_qualities: "low-light vision, scent",
      advancement: "7th-Level Advancement: Size Large",
    });
    expect(sheet.abilities.primary.str.score).toBe(13);
    expect(sheet.identity.size).toBe("medium");
    expect(sheet.combat.speed.base).toBe("50 ft.");
    expect(sheet.defenses.armorClass.conditionalModifiers.find((m) => m.id === "ac_natural")?.value).toBe(2);
    expect(sheet.combat.attacks.map((a) => a.name)).toContain("bite");
    expect(sheet.features.list.map((f) => f.name)).toEqual(
      expect.arrayContaining(["Special qualities", "Advancement"]),
    );
    // The filled sheet still computes.
    const out = computeCharacter(sheet);
    expect(out.summary.ac).toBe(10 + 2 + 2); // dex +2, natural +2
  });
});

describe("master cache", () => {
  it("captures level/bab/hp/saves/skill ranks and detects changes", () => {
    const master = createDefaultCharacter({ name: "Boss" });
    master.identity.totalLevel = 4;
    master.combat.bab.total = 4;
    master.health.maxHp = 30;
    master.defenses.savingThrows.will.base = 4;
    master.skills.list.find((s) => s.key === "perception")!.ranks = 4;
    const computed = computeCharacter(master);
    const cache = buildMasterCache("m1", master, computed);
    expect(cache.level).toBe(4);
    expect(cache.bab).toBe(4);
    expect(cache.hpMax).toBe(30);
    expect(cache.saves.will).toBe(4);
    expect(cache.skillRanks.perception).toBe(4);

    expect(masterCacheEquals(cache, { ...cache, syncedAt: "other-time" })).toBe(true);
    expect(masterCacheEquals(cache, { ...cache, level: 5 })).toBe(false);
    expect(masterCacheEquals(undefined, cache)).toBe(false);
  });
});
