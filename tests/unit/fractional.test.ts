import { describe, it, expect } from "vitest";
import { createDefaultCharacter, recomputeClassDerived } from "@pathforge/schema";

describe("fractional bab/saves (Unchained variant)", () => {
  it("BAB sums fractions then floors once", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.identity.classes = [
      { id: "f", name: "Fighter", level: 1, presetKey: "fighter" }, // full
      { id: "r", name: "Rogue", level: 1, presetKey: "rogue" }, // three_quarter
    ];
    c.identity.totalLevel = 2;
    c.rules.variants.fractionalBabSaves = true;
    recomputeClassDerived(c, { hpMethod: "manual" });
    // floor(1.0 + 0.75) = 1 (non-fractional Fighter1 + Rogue0 also = 1, but the rounding path differs)
    expect(c.combat.bab.total).toBe(1);

    c.combat.bab.total = 0;
    c.rules.variants.fractionalBabSaves = false;
    recomputeClassDerived(c, { hpMethod: "manual" });
    expect(c.combat.bab.total).toBe(1); // 1 + 0
  });

  it("the good-save +2 is counted once across a multiclass (the point of fractional)", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.identity.classes = [
      { id: "f", name: "Fighter", level: 5, presetKey: "fighter" }, // good Fort
      { id: "b", name: "Barbarian", level: 5, presetKey: "barbarian" }, // good Fort
    ];
    c.identity.totalLevel = 10;

    c.rules.variants.fractionalBabSaves = true;
    recomputeClassDerived(c, { hpMethod: "manual" });
    // floor(2 + 5×0.5 + 5×0.5) = 7
    expect(c.defenses.savingThrows.fortitude.base).toBe(7);

    c.rules.variants.fractionalBabSaves = false;
    recomputeClassDerived(c, { hpMethod: "manual" });
    // rounded per class: (2+2) + (2+2) = 8 — the +2 double-counted
    expect(c.defenses.savingThrows.fortitude.base).toBe(8);
  });
});
