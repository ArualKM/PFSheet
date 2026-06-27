import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "stamina", enabled: true, settings: {} });
  return c;
}

describe("stamina", () => {
  it("pool max = BAB + Con modifier + bonus, current clamped", () => {
    const c = enabled();
    c.combat.bab.total = 6;
    c.abilities.primary.con.score = 14; // +2
    c.stamina = { current: 99, bonusMax: 1 };
    expect(computeCharacter(c).summary.stamina).toEqual({ current: 9, max: 9 }); // 6 + 2 + 1
  });

  it("max floors at 0 (negative BAB+Con can't go below 0)", () => {
    const c = enabled();
    c.combat.bab.total = 0;
    c.abilities.primary.con.score = 6; // −2
    c.stamina = { current: 5, bonusMax: 0 };
    expect(computeCharacter(c).summary.stamina).toEqual({ current: 0, max: 0 });
  });

  it("absent in the summary unless enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.combat.bab.total = 6;
    expect(computeCharacter(c).summary.stamina).toBeUndefined();
  });
});
