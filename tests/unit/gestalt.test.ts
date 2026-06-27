import { describe, it, expect } from "vitest";
import { createDefaultCharacter, recomputeClassDerived, gestaltLevel } from "@pathforge/schema";

function gestaltChar() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
  c.abilities.primary.con.score = 14; // +2
  c.identity.classes = [
    { id: "f", name: "Fighter", level: 5, presetKey: "fighter", track: "a", hitDie: "d10" }, // full BAB, good Fort
    { id: "w", name: "Wizard", level: 5, presetKey: "wizard", track: "b", hitDie: "d6" }, // ½ BAB, good Will
  ];
  return c;
}

describe("gestalt", () => {
  it("character level is the higher track, not the sum of class levels", () => {
    const c = gestaltChar();
    expect(gestaltLevel(c)).toBe(5); // max(5, 5), not 10
    recomputeClassDerived(c, { hpMethod: "manual" });
    expect(c.identity.totalLevel).toBe(5);
  });

  it("takes the best BAB and the best of each save across tracks", () => {
    const c = gestaltChar();
    recomputeClassDerived(c, { hpMethod: "manual" });
    expect(c.combat.bab.total).toBe(5); // max(Fighter 5, Wizard 2)
    expect(c.defenses.savingThrows.fortitude.base).toBe(4); // Fighter good (4) vs Wizard poor (1)
    expect(c.defenses.savingThrows.will.base).toBe(4); // Wizard good (4) vs Fighter poor (1)
    expect(c.defenses.savingThrows.reflex.base).toBe(1); // both poor → 1
  });

  it("HP uses the better track's die, not both summed", () => {
    const c = gestaltChar();
    recomputeClassDerived(c, { hpMethod: "average" });
    // Fighter track: 10 + 4×6 (avg d10) + Con 2×5 = 34 + 10 = 44; Wizard track smaller → 44
    expect(c.health.maxHp).toBe(44);
  });
});
