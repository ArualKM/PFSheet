import { describe, it, expect } from "vitest";
import { createDefaultCharacter, computeMaxHpFromLevels } from "@pathforge/schema";

describe("computeMaxHpFromLevels", () => {
  it("first level max, rest average, plus Con per level and FCB", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.con.score = 14; // +2
    c.identity.classes = [{ id: "c1", name: "Fighter", level: 5, hitDie: "d10" }];
    c.health.favoredClassHpBonus = 3;
    const r = computeMaxHpFromLevels(c, "average");
    expect(r.hd).toBe(34); // 10 (L1) + 4 × avg(d10)=6
    expect(r.con).toBe(10); // +2 × 5
    expect(r.fcb).toBe(3);
    expect(r.total).toBe(47);
  });

  it("max method takes the full die each level", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.con.score = 10; // +0
    c.identity.classes = [{ id: "c1", name: "Wizard", level: 3, hitDie: "d6" }];
    expect(computeMaxHpFromLevels(c, "max").total).toBe(18); // 6 × 3
  });

  it("each Hit Die yields at least 1 hp despite a brutal Con penalty", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.con.score = 1; // −5
    c.identity.classes = [{ id: "c1", name: "Wizard", level: 2, hitDie: "d6" }];
    expect(computeMaxHpFromLevels(c, "average").total).toBe(2); // max(1, …) per HD
  });

  it("multiclass: only the very first character level takes max", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.con.score = 10;
    c.identity.classes = [
      { id: "c1", name: "Fighter", level: 1, hitDie: "d10" },
      { id: "c2", name: "Wizard", level: 1, hitDie: "d6" },
    ];
    expect(computeMaxHpFromLevels(c, "average").total).toBe(14); // 10 (max) + avg(d6)=4
  });
});
