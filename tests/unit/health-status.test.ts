import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

describe("negative levels", () => {
  it("apply −1 per level to attacks/saves/skills and −5 hp per level to max", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.health.maxHp = 40;
    const before = computeCharacter(c);
    c.health.negativeLevels = 2;
    const after = computeCharacter(c);
    expect(after.attackBonuses.melee.value - before.attackBonuses.melee.value).toBe(-2);
    expect(after.summary.fortitude - before.summary.fortitude).toBe(-2);
    expect(after.summary.will - before.summary.will).toBe(-2);
    expect((after.skills.perception?.value ?? 0) - (before.skills.perception?.value ?? 0)).toBe(-2);
    expect(before.summary.hp.max - after.summary.hp.max).toBe(10); // 5 × 2
  });
});

describe("hp status", () => {
  it("nonlethal == current → staggered; > current → unconscious", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.health.maxHp = 20;
    c.health.currentHp = 10;
    c.health.nonlethalDamage = 9;
    expect(computeCharacter(c).summary.hp.status).toBe("ok");
    c.health.nonlethalDamage = 10;
    expect(computeCharacter(c).summary.hp.status).toBe("staggered");
    c.health.nonlethalDamage = 11;
    expect(computeCharacter(c).summary.hp.status).toBe("unconscious");
  });

  it("0 hp → disabled; below 0 → dying; ≤ −Con → dead", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.con.score = 12;
    c.health.maxHp = 20;
    c.health.currentHp = 0;
    expect(computeCharacter(c).summary.hp.status).toBe("disabled");
    c.health.currentHp = -3;
    expect(computeCharacter(c).summary.hp.status).toBe("dying");
    c.health.currentHp = -12; // ≤ −12 (Con score)
    expect(computeCharacter(c).summary.hp.status).toBe("dead");
  });
});
