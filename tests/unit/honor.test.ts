import { describe, it, expect } from "vitest";
import { createDefaultCharacter, honorScore, honorTier } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "honor", enabled: true, settings: {} });
  c.abilities.primary.cha.score = 14;
  c.identity.totalLevel = 5;
  return c;
}

describe("honor", () => {
  it("score = Cha score + level + event deltas, clamped 0-100", () => {
    const c = enabled(); // 14 + 5 = 19
    expect(honorScore(c)).toBe(19);
    c.honor = { code: "general", events: [{ id: "e1", delta: -25 }] };
    expect(honorScore(c)).toBe(0);
    c.honor = { code: "general", events: [{ id: "e2", delta: 200 }] };
    expect(honorScore(c)).toBe(100);
  });

  it("tier bands", () => {
    expect(honorTier(0)).toBe("Dishonored");
    expect(honorTier(50)).toBe("Respected");
    expect(honorTier(95)).toBe("Legendary");
  });

  it("dishonored (0 honor) applies −2 to Will saves and Cha-based skills", () => {
    const c = enabled();
    c.abilities.primary.cha.score = 8; // baseline 8 + 5 = 13
    c.honor = { code: "general", events: [{ id: "e1", delta: -20 }] }; // → 0
    const willLow = computeCharacter(c).summary.will;
    const diploLow = computeCharacter(c).skills.diplomacy?.value ?? 0;
    c.honor = { code: "general", events: [] }; // 13, not dishonored
    expect(computeCharacter(c).summary.will - willLow).toBe(2);
    expect((computeCharacter(c).skills.diplomacy?.value ?? 0) - diploLow).toBe(2);
  });

  it("absent in the summary unless enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(computeCharacter(c).summary.honor).toBeUndefined();
  });
});
