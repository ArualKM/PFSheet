import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function base() {
  const c = createDefaultCharacter({ name: "X" });
  c.abilities.primary.str.score = 14; // +2
  c.abilities.primary.dex.score = 14; // +2
  return c;
}

describe("conditions engine", () => {
  it("Shaken applies -2 to all three saving throws + melee attack", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Shaken");
    const a = computeCharacter(c);
    expect(a.summary.fortitude - b.summary.fortitude).toBe(-2);
    expect(a.summary.reflex - b.summary.reflex).toBe(-2);
    expect(a.summary.will - b.summary.will).toBe(-2);
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(-2);
  });

  it("Fatigued is -2 Str/Dex and cascades (AC + Reflex via Dex, melee via Str)", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Fatigued");
    const a = computeCharacter(c);
    // Dex 14→12 = -1 modifier
    expect(a.summary.ac - b.summary.ac).toBe(-1);
    expect(a.summary.reflex - b.summary.reflex).toBe(-1);
    // Fort uses Con (untouched)
    expect(a.summary.fortitude - b.summary.fortitude).toBe(0);
    // Str 14→12 = -1 modifier → melee attack
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(-1);
  });

  it("two stacking conditions sum on attacks (Shaken + Sickened = -4)", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Shaken", "Sickened");
    const a = computeCharacter(c);
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(-4);
  });

  it("an unknown / free-typed condition has no mechanical effect", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Inspired by a rousing speech");
    const a = computeCharacter(c);
    expect(a.summary).toEqual(b.summary);
    expect(a.attackBonuses.melee.value).toBe(b.attackBonuses.melee.value);
  });

  it("condition names are case-insensitive", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("FATIGUED");
    const a = computeCharacter(c);
    expect(a.summary.reflex - b.summary.reflex).toBe(-1);
  });

  it("fear conditions DON'T stack with each other (Shaken + Frightened = -2, not -4)", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Shaken", "Frightened");
    const a = computeCharacter(c);
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(-2);
    expect(a.summary.will - b.summary.will).toBe(-2);
  });

  it("the fatigue track takes the most severe (Fatigued + Exhausted = -6 Dex)", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Fatigued", "Exhausted");
    const a = computeCharacter(c);
    // Dex 14 −6 = 8 (−1 mod), was +2 → −3 delta on Reflex
    expect(a.summary.reflex - b.summary.reflex).toBe(-3);
  });

  it("a duplicated condition doesn't double-apply", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Shaken", "Shaken");
    const a = computeCharacter(c);
    expect(a.summary.will - b.summary.will).toBe(-2);
  });

  it("Blinded is -2 AC", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Blinded");
    expect(computeCharacter(c).summary.ac - b.summary.ac).toBe(-2);
  });

  it("Deafened is -4 initiative", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Deafened");
    expect(computeCharacter(c).summary.initiative - b.summary.initiative).toBe(-4);
  });

  it("Squeezing is -4 attack and -4 AC", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Squeezing");
    const a = computeCharacter(c);
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(-4);
    expect(a.summary.ac - b.summary.ac).toBe(-4);
  });

  it("Invisible is +2 to attacks", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Invisible");
    expect(computeCharacter(c).attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(2);
  });

  it("Pinned (-4 AC) stacks with Grappled (-2 attack, -4 Dex)", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Pinned", "Grappled");
    const a = computeCharacter(c);
    // Pinned -4 AC, plus Grappled's -4 Dex (14→10, -2 mod) hits AC too → -6 total AC.
    expect(a.summary.ac - b.summary.ac).toBe(-6);
    // Grappled -2 attack, plus Dex doesn't touch melee; Str unchanged → -2 melee.
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(-2);
  });

  it("nauseated / paralyzed are display-only (no mechanical effect)", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Nauseated", "Paralyzed");
    const a = computeCharacter(c);
    expect(a.summary).toEqual(b.summary);
  });

  it("the catalog + the matching buff card collapse (no double-apply)", () => {
    const c = base();
    const b = computeCharacter(c);
    c.health.conditions.push("Shaken");
    c.buffs.active.push({
      id: "b1",
      name: "Shaken",
      enabled: true,
      effects: [
        { id: "e1", target: "attack", operation: "subtract", value: 2, bonusType: "penalty", stackingGroup: "fear" },
        { id: "e2", target: "saves.will", operation: "subtract", value: 2, bonusType: "penalty", stackingGroup: "fear" },
      ],
    });
    const a = computeCharacter(c);
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(-2);
    expect(a.summary.will - b.summary.will).toBe(-2);
  });
});
