import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  sphereCasterLevel,
  applyTraditionGrants,
  talentSystem,
  grantSystem,
  grantsTargeting,
  systemTradition,
  applySystemTradition,
} from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "spheres_of_power", enabled: true, settings: {} });
  c.abilities.primary.int.score = 18; // +4
  c.spheres = {
    casterClasses: [
      { id: "c1", className: "Incanter", system: "Magic", casterType: "high", classLevel: 10, castingAbility: "int" },
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
      { id: "c1", className: "Mid", system: "Magic", casterType: "mid", classLevel: 6, castingAbility: "int" }, // CL 4
      { id: "c2", className: "High", system: "Magic", casterType: "high", classLevel: 4, castingAbility: "int" }, // CL 4
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

  it("Might: a Combat practitioner class drives combat talents known; spent counted by sphere system", () => {
    const c = createDefaultCharacter({ name: "M" });
    c.rules.modules.push({ key: "spheres_of_might", enabled: true, settings: {} });
    c.spheres = {
      casterClasses: [
        { id: "p1", className: "Armiger", system: "Combat", casterType: "high", classLevel: 8, castingAbility: "str" },
      ],
      spheres: [
        { id: "s1", name: "Brute", system: "Combat" },
        { id: "s2", name: "Scout", system: "Combat" },
      ],
      talents: [
        { id: "t1", sphereName: "Brute", talentName: "Slam" },
        { id: "t2", sphereName: "Scout", talentName: "Lurker" },
      ],
      drawbacks: [],
      boons: [],
      bonusSpellPoints: 0,
    };
    const sp = computeCharacter(c).summary.spheres!;
    expect(sp.combatTalentsKnown).toBe(8); // expert/high rate, level 8
    expect(sp.combatTalentsSpent).toBe(2); // both talents' spheres are Combat-system
    expect(sp.casterLevel).toBe(0); // no Magic classes → Power math untouched
    expect(sp.spellPoints.max).toBe(0);
    expect(sp.systems.might).toBe(true);
  });

  it("Guile: a Skill practitioner class drives skill talents known (3/4 rate)", () => {
    const c = createDefaultCharacter({ name: "G" });
    c.rules.modules.push({ key: "spheres_of_guile", enabled: true, settings: {} });
    c.spheres = {
      casterClasses: [
        { id: "p1", className: "Sage", system: "Skill", casterType: "mid", classLevel: 12, castingAbility: "int" },
      ],
      spheres: [{ id: "s1", name: "Study", system: "Skill" }],
      talents: [{ id: "t1", sphereName: "Study", talentName: "Analyze" }],
      drawbacks: [],
      boons: [],
      bonusSpellPoints: 0,
    };
    const sp = computeCharacter(c).summary.spheres!;
    expect(sp.skillTalentsKnown).toBe(9); // floor(12 * 3/4)
    expect(sp.skillTalentsSpent).toBe(1);
  });

  it("tradition provenance: switching replaces the prior tradition's grants, keeps manual entries", () => {
    const block: {
      drawbacks: string[];
      boons: string[];
      tradition?: string;
      traditionGrants?: { drawbacks: string[]; boons: string[] };
    } = { drawbacks: ["Manual drawback"], boons: [] };

    applyTraditionGrants(block, { name: "Tradition A", drawbacks: ["A1", "A2"], boons: ["Boon A"] });
    expect(block.drawbacks).toEqual(["Manual drawback", "A1", "A2"]);
    expect(block.boons).toEqual(["Boon A"]);
    expect(block.tradition).toBe("Tradition A");

    applyTraditionGrants(block, { name: "Tradition B", drawbacks: ["B1"], boons: [] });
    expect(block.drawbacks).toEqual(["Manual drawback", "B1"]); // A1/A2 removed, manual kept
    expect(block.boons).toEqual([]); // Boon A removed
    expect(block.tradition).toBe("Tradition B");
  });

  it("engine counts talents via talentSystem — an explicit system tag wins over the sphere's system", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.rules.modules.push({ key: "spheres_of_might", enabled: true, settings: {} });
    c.spheres = {
      casterClasses: [
        { id: "p1", className: "Armiger", system: "Combat", casterType: "high", classLevel: 8, castingAbility: "str" },
      ],
      spheres: [{ id: "s1", name: "Destruction", system: "Magic" }],
      talents: [
        // explicit Combat tag despite living under a Magic sphere → counts as Combat (editor + engine agree)
        { id: "t1", sphereName: "Destruction", talentName: "X", system: "Combat" },
        { id: "t2", sphereName: "Destruction", talentName: "Y" }, // no tag → inferred Magic
      ],
      drawbacks: [],
      boons: [],
      bonusSpellPoints: 0,
    };
    expect(computeCharacter(c).summary.spheres!.combatTalentsSpent).toBe(1);
  });

  it("bonus (free) talents are excluded from the spent budget", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.rules.modules.push({ key: "spheres_of_might", enabled: true, settings: {} });
    c.spheres = {
      casterClasses: [
        { id: "p1", className: "Armiger", system: "Combat", casterType: "high", classLevel: 8, castingAbility: "str" },
      ],
      spheres: [{ id: "s1", name: "Brute", system: "Combat" }],
      talents: [
        { id: "t1", sphereName: "Brute", talentName: "Slam" },
        { id: "t2", sphereName: "Brute", talentName: "Free Slam", bonus: true },
      ],
      drawbacks: [],
      boons: [],
      bonusSpellPoints: 0,
    };
    expect(computeCharacter(c).summary.spheres!.combatTalentsSpent).toBe(1); // the bonus talent doesn't count
  });

  it("talentSystem: explicit tag wins, else infers from the talent's sphere, else Magic", () => {
    const spheres = [
      { name: "Brute", system: "Combat" as const },
      { name: "Destruction", system: "Magic" as const },
    ];
    expect(talentSystem({ system: "Skill", sphereName: "Brute" }, spheres)).toBe("Skill"); // explicit wins
    expect(talentSystem({ sphereName: "Brute" }, spheres)).toBe("Combat"); // inferred from sphere
    expect(talentSystem({ sphereName: "Destruction" }, spheres)).toBe("Magic");
    expect(talentSystem({ sphereName: "Nonexistent" }, spheres)).toBe("Magic"); // fallback
  });

  it("grantSystem + grantsTargeting read the drawback/boon side-table meta", () => {
    const block = {
      drawbacks: ["Draining Casting", "Magical Signs"],
      boons: ["Easy Focus"],
      drawbackMeta: {
        "Draining Casting": { system: "Combat" as const, appliesTo: { kind: "talent" as const, id: "tal_1" } },
      },
      boonMeta: {},
    };
    expect(grantSystem("Draining Casting", block.drawbackMeta)).toBe("Combat");
    expect(grantSystem("Magical Signs", block.drawbackMeta)).toBe("Magic"); // no meta → default
    const onTalent = grantsTargeting(block, "talent", "tal_1");
    expect(onTalent.drawbacks).toEqual(["Draining Casting"]);
    expect(onTalent.boons).toEqual([]);
    expect(grantsTargeting(block, "sphere", "sph_x").drawbacks).toEqual([]); // nothing targets this
  });

  it("per-system traditions: replace one system without touching others; legacy Magic fallback + tagging", () => {
    const block = {
      casterClasses: [],
      spheres: [],
      talents: [],
      drawbacks: [],
      boons: [],
      bonusSpellPoints: 0,
      tradition: "Old Casting", // legacy single field
    } as Parameters<typeof applySystemTradition>[0];

    expect(systemTradition(block, "Magic")?.name).toBe("Old Casting"); // legacy fallback
    expect(systemTradition(block, "Combat")).toBeUndefined();

    applySystemTradition(block, "Magic", { name: "Tradition A", drawbacks: ["A1"], boons: [] });
    expect(systemTradition(block, "Magic")?.name).toBe("Tradition A");
    expect(block.tradition).toBeUndefined(); // legacy cleared once a per-system entry exists
    expect(block.drawbacks).toContain("A1");
    expect(block.drawbackMeta?.["A1"]?.system).toBe("Magic"); // grant tagged to its system

    applySystemTradition(block, "Combat", { name: "Iron Practice", drawbacks: ["C1"], boons: [] });
    expect(systemTradition(block, "Combat")?.name).toBe("Iron Practice");
    expect(systemTradition(block, "Magic")?.name).toBe("Tradition A"); // untouched

    // Magic A→B replaces A1 but leaves the Combat grant alone
    applySystemTradition(block, "Magic", { name: "Tradition B", drawbacks: ["B1"], boons: [] });
    expect(block.drawbacks).not.toContain("A1");
    expect(block.drawbacks).toEqual(expect.arrayContaining(["B1", "C1"]));
  });

  it("applySystemTradition shares (does not steal) a grant name already tagged to another system", () => {
    const block = {
      casterClasses: [],
      spheres: [],
      talents: [],
      drawbacks: [],
      boons: [],
      bonusSpellPoints: 0,
    } as Parameters<typeof applySystemTradition>[0];
    applySystemTradition(block, "Magic", { name: "Casting Trad", drawbacks: ["Shared"], boons: [] });
    expect(grantSystem("Shared", block.drawbackMeta)).toBe("Magic");
    applySystemTradition(block, "Combat", { name: "Martial Trad", drawbacks: ["Shared"], boons: [] });
    expect(grantSystem("Shared", block.drawbackMeta)).toBe("Magic"); // stays in Power's card, not stolen
    expect(block.drawbacks.filter((d) => d === "Shared")).toHaveLength(1); // one entry, deduped
  });

  it("absent unless a spheres module is enabled", () => {
    expect(computeCharacter(createDefaultCharacter({ name: "X" })).summary.spheres).toBeUndefined();
  });
});
