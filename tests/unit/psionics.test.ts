import { describe, it, expect } from "vitest";
import { createDefaultCharacter, bonusPowerPoints } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "psionics", enabled: true, settings: {} });
  c.abilities.primary.int.score = 18; // +4
  c.psionics = {
    classes: [
      { id: "p1", className: "Psion", manifesterLevel: 10, keyAbility: "int", basePowerPoints: 90, discipline: "telepathy" },
    ],
    powersKnown: [{ id: "pw1", name: "Energy Ray", level: 1 }],
  };
  return c;
}

describe("psionics", () => {
  it("bonus PP = floor(keyMod × ML / 2), floored at 0", () => {
    expect(bonusPowerPoints(4, 10)).toBe(20);
    expect(bonusPowerPoints(0, 10)).toBe(0);
    expect(bonusPowerPoints(-2, 10)).toBe(0);
  });

  it("pool max = base + bonus PP; ML cap + powers count", () => {
    const ps = computeCharacter(enabled()).summary.psionics!;
    expect(ps.powerPoints.max).toBe(110); // 90 base + 20 bonus (Int +4 × ML 10 ÷ 2)
    expect(ps.manifesterLevel).toBe(10);
    expect(ps.maxPowerCost).toBe(10);
    expect(ps.powersKnown).toBe(1);
  });

  it("current PP clamps to max", () => {
    const c = enabled();
    c.psionics!.powerPointsCurrent = 999;
    expect(computeCharacter(c).summary.psionics!.powerPoints.current).toBe(110);
  });

  it("absent unless the module is enabled", () => {
    expect(computeCharacter(createDefaultCharacter({ name: "X" })).summary.psionics).toBeUndefined();
  });
});
