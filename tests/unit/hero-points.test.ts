import { describe, it, expect } from "vitest";
import { createDefaultCharacter, maxHeroPoints } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "hero_points", enabled: true, settings: {} });
  return c;
}

describe("hero points", () => {
  it("maxHeroPoints = 3 base, +1 Hero's Fortune, + bonus, floored at 0", () => {
    expect(maxHeroPoints({})).toBe(3);
    expect(maxHeroPoints({ heroesFortune: true })).toBe(4);
    expect(maxHeroPoints({ heroesFortune: true, bonusMax: 2 })).toBe(6);
    // a negative bonus can't drive the max below 0 (would crash the pip render otherwise)
    expect(maxHeroPoints({ bonusMax: -10 })).toBe(0);
  });

  it("is absent in the computed summary unless the module is enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.heroPoints = { current: 2, bonusMax: 0, log: [] };
    expect(computeCharacter(c).summary.heroPoints).toBeUndefined();
  });

  it("computes max 3 and clamps current when enabled", () => {
    const c = enabled();
    c.heroPoints = { current: 5, bonusMax: 0, log: [] };
    expect(computeCharacter(c).summary.heroPoints).toEqual({ current: 3, max: 3 });
  });

  it("Hero's Fortune raises the cap to 4", () => {
    const c = enabled();
    c.heroPoints = { current: 4, heroesFortune: true, bonusMax: 0, log: [] };
    expect(computeCharacter(c).summary.heroPoints).toEqual({ current: 4, max: 4 });
  });

  it("enabled but with no heroPoints block yields no summary (lazily created in the editor)", () => {
    const c = enabled();
    expect(computeCharacter(c).summary.heroPoints).toBeUndefined();
  });
});
