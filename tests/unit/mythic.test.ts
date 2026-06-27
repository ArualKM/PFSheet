import { describe, it, expect } from "vitest";
import { createDefaultCharacter, maxMythicPower, mythicSurgeDie } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled(tier: number) {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.variants.mythic = true;
  c.mythic = { tier, path: "champion", abilityBoosts: [], pathAbilities: [] };
  return c;
}

describe("mythic", () => {
  it("power pool = 3 + 2×tier; surge die scales by band", () => {
    expect(maxMythicPower(0)).toBe(0);
    expect(maxMythicPower(1)).toBe(5);
    expect(maxMythicPower(10)).toBe(23);
    expect(mythicSurgeDie(0)).toBe("");
    expect(mythicSurgeDie(3)).toBe("1d6");
    expect(mythicSurgeDie(4)).toBe("1d8");
    expect(mythicSurgeDie(7)).toBe("1d10");
    expect(mythicSurgeDie(10)).toBe("1d12");
  });

  it("summary.mythic carries tier/path/surge/power/effective-level", () => {
    const m = computeCharacter(enabled(6)).summary.mythic!;
    expect(m.tier).toBe(6);
    expect(m.path).toBe("champion");
    expect(m.surgeDie).toBe("1d8");
    expect(m.power).toEqual({ current: 15, max: 15 }); // 3 + 2×6
    expect(m.effectiveLevelBonus).toBe(3); // floor(6/2)
  });

  it("Amazing Initiative adds +tier to initiative at tier 2+, not at tier 1", () => {
    const base = computeCharacter(createDefaultCharacter({ name: "X" })).summary.initiative;
    expect(computeCharacter(enabled(1)).summary.initiative - base).toBe(0);
    expect(computeCharacter(enabled(4)).summary.initiative - base).toBe(4);
  });

  it("absent unless the variant is enabled", () => {
    expect(computeCharacter(createDefaultCharacter({ name: "X" })).summary.mythic).toBeUndefined();
  });
});
