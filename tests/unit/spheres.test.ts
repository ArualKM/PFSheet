import { describe, it, expect } from "vitest";
import { createDefaultCharacter, sphereCasterLevel } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "spheres_of_power", enabled: true, settings: {} });
  c.abilities.primary.int.score = 18; // +4
  c.spheres = {
    casterClasses: [
      { id: "c1", className: "Incanter", casterType: "high", classLevel: 10, castingAbility: "int" },
    ],
    spheres: [
      { id: "s1", name: "Destruction", system: "Magic" },
      { id: "s2", name: "Conjuration", system: "Magic" },
    ],
    talents: [{ id: "t1", sphereName: "Destruction", talentName: "Energy Blade" }],
    drawbacks: [],
    boons: [],
    bonusSpellPoints: 0,
  };
  return c;
}

describe("spheres", () => {
  it("caster level follows the High/Mid/Low table", () => {
    expect(sphereCasterLevel("high", 10)).toBe(10);
    expect(sphereCasterLevel("mid", 10)).toBe(7); // floor(30/4)
    expect(sphereCasterLevel("low", 10)).toBe(5);
    expect(sphereCasterLevel("mid", 5)).toBe(3); // floor(15/4)
    expect(sphereCasterLevel("low", 7)).toBe(3);
  });

  it("SP = class level + ability; MSB = CL; MSD = 11 + MSB; DC = 10 + ½CL + ability", () => {
    const sp = computeCharacter(enabled()).summary.spheres!;
    expect(sp.casterLevel).toBe(10);
    expect(sp.spellPoints.max).toBe(14); // 10 class level + 4 Int
    expect(sp.magicSkillBonus).toBe(10);
    expect(sp.magicSkillDefense).toBe(21); // 11 + 10
    expect(sp.saveDc).toBe(19); // 10 + 5 + 4
    expect(sp.sphereCount).toBe(2);
    expect(sp.talentCount).toBe(1);
  });

  it("current SP clamps to max", () => {
    const c = enabled();
    c.spheres!.spellPointsCurrent = 999;
    expect(computeCharacter(c).summary.spheres!.spellPoints.current).toBe(14);
  });

  it("mid-caster lowers caster level (and DC) but MSB/MSD use CLASS levels, SP uses class level", () => {
    const c = enabled();
    c.spheres!.casterClasses[0]!.casterType = "mid"; // caster level 7, class level still 10
    const sp = computeCharacter(c).summary.spheres!;
    expect(sp.casterLevel).toBe(7); // High/Mid/Low progression
    expect(sp.magicSkillBonus).toBe(10); // RAW: total casting-class levels, NOT caster level
    expect(sp.magicSkillDefense).toBe(21); // 11 + class level 10
    expect(sp.saveDc).toBe(17); // 10 + floor(caster level 7 / 2)=3 + 4
    expect(sp.spellPoints.max).toBe(14); // class level 10 + Int 4 (NOT caster level)
  });

  it("multiclass: MSB = Σ class levels; caster level = Σ High/Mid/Low (a High-only fixture can't mask it)", () => {
    const c = enabled();
    c.spheres!.casterClasses = [
      { id: "c1", className: "Mid", casterType: "mid", classLevel: 6, castingAbility: "int" }, // CL 4
      { id: "c2", className: "High", casterType: "high", classLevel: 4, castingAbility: "int" }, // CL 4
    ];
    const sp = computeCharacter(c).summary.spheres!;
    expect(sp.casterLevel).toBe(8); // 4 + 4
    expect(sp.magicSkillBonus).toBe(10); // 6 + 4 class levels
    expect(sp.magicSkillDefense).toBe(21); // 11 + 10
  });

  it("bonus spell points add to the pool", () => {
    const c = enabled();
    c.spheres!.bonusSpellPoints = 3;
    expect(computeCharacter(c).summary.spheres!.spellPoints.max).toBe(17);
  });

  it("reports which systems are enabled + counts spheres by system", () => {
    const c = enabled();
    c.rules.modules.push({ key: "spheres_of_might", enabled: true, settings: {} });
    c.spheres!.spheres = [
      { id: "s1", name: "Destruction", system: "Magic" },
      { id: "s2", name: "Berserker", system: "Combat" },
      { id: "s3", name: "Athletics", system: "Combat" },
    ];
    const sp = computeCharacter(c).summary.spheres!;
    expect(sp.systems).toEqual({ power: true, might: true, guile: false });
    expect(sp.combatSphereCount).toBe(2);
    expect(sp.skillSphereCount).toBe(0);
  });

  it("Might-only character (no casting classes) computes without crashing", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.rules.modules.push({ key: "spheres_of_might", enabled: true, settings: {} });
    c.spheres = {
      casterClasses: [],
      spheres: [{ id: "s1", name: "Brute", system: "Combat" }],
      talents: [{ id: "t1", sphereName: "Brute", talentName: "Slam" }],
      drawbacks: [],
      boons: [],
      bonusSpellPoints: 0,
      martialFocus: true,
    };
    const sp = computeCharacter(c).summary.spheres!;
    expect(sp.systems).toEqual({ power: false, might: true, guile: false });
    expect(sp.casterLevel).toBe(0);
    expect(sp.spellPoints.max).toBe(0);
    expect(sp.magicSkillDefense).toBe(11); // 11 + 0
    expect(sp.martialFocus).toBe(true);
    expect(sp.combatSphereCount).toBe(1);
  });

  it("absent unless a spheres module is enabled", () => {
    expect(computeCharacter(createDefaultCharacter({ name: "X" })).summary.spheres).toBeUndefined();
  });
});
