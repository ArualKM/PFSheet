import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.variants.woundsVigor = true;
  c.abilities.primary.con.score = 14; // wounds 28, threshold 14
  c.identity.classes = [{ id: "f", name: "Fighter", level: 3, hitDie: "d10" }];
  c.identity.totalLevel = 3;
  return c;
}

describe("wounds & vigor", () => {
  it("derives Vigor from HD (no Con), Wounds = 2×Con, threshold = Con", () => {
    const c = enabled();
    const wv = computeCharacter(c).summary.woundsVigor!;
    // Vigor = HD only: 10 (L1) + 2×avg(d10)=6 = 22, no Con
    expect(wv.vigor.max).toBe(22);
    expect(wv.wound.max).toBe(28); // 2 × 14
    expect(wv.wound.threshold).toBe(14);
    expect(wv.status).toBe("ok"); // full wounds
  });

  it("status: wounded at ≤ threshold, dead at 0", () => {
    const c = enabled();
    c.health.woundsVigor = { currentWounds: 14, tempVigor: 0 }; // at threshold
    expect(computeCharacter(c).summary.woundsVigor!.status).toBe("wounded");
    c.health.woundsVigor = { currentWounds: 0, tempVigor: 0 };
    expect(computeCharacter(c).summary.woundsVigor!.status).toBe("dead");
  });

  it("manual max overrides win over the derived defaults", () => {
    const c = enabled();
    c.health.woundsVigor = { maxVigor: 40, maxWounds: 30, woundThreshold: 10, tempVigor: 0 };
    const wv = computeCharacter(c).summary.woundsVigor!;
    expect(wv.vigor.max).toBe(40);
    expect(wv.wound.max).toBe(30);
    expect(wv.wound.threshold).toBe(10);
  });

  it("absent unless the variant is enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(computeCharacter(c).summary.woundsVigor).toBeUndefined();
  });
});
