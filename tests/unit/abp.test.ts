import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function plain(level: number) {
  const c = createDefaultCharacter({ name: "X" });
  c.identity.totalLevel = level;
  return c;
}
function abp(level: number) {
  const c = plain(level);
  c.rules.variants.automaticBonusProgression = true;
  return c;
}

describe("Automatic Bonus Progression", () => {
  it("does nothing when disabled (level alone grants no big-six bonuses)", () => {
    const hi = computeCharacter(plain(20)).summary;
    const lo = computeCharacter(plain(1)).summary;
    expect(hi.ac).toBe(lo.ac);
    expect(hi.fortitude).toBe(lo.fortitude);
  });

  it("level 5: +1 resistance (saves), +1 armor + +1 deflection (AC), +1 weapon (attack)", () => {
    const b = computeCharacter(plain(5));
    const a = computeCharacter(abp(5));
    expect(a.summary.fortitude - b.summary.fortitude).toBe(1); // resistance
    expect(a.summary.will - b.summary.will).toBe(1);
    expect(a.summary.ac - b.summary.ac).toBe(2); // armor enhancement +1 + deflection +1 (distinct types)
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(1); // weapon attunement
  });

  it("toughening (natural armor) starts at level 8", () => {
    const a7 = computeCharacter(abp(7)).summary.ac - computeCharacter(plain(7)).summary.ac; // armor+deflection
    expect(a7).toBe(2);
    const a8 = computeCharacter(abp(8)).summary.ac - computeCharacter(plain(8)).summary.ac; // +toughening
    expect(a8).toBe(3);
  });

  it("level 20: each big-six bonus caps at +5", () => {
    const b = computeCharacter(plain(20));
    const a = computeCharacter(abp(20));
    expect(a.summary.fortitude - b.summary.fortitude).toBe(5); // resistance +5
    expect(a.summary.ac - b.summary.ac).toBe(15); // armor +5 + deflection +5 + toughening +5
    expect(a.attackBonuses.melee.value - b.attackBonuses.melee.value).toBe(5); // weapon +5
  });

  it("prowess (ability) bonuses are NOT auto-applied — they are player-assigned", () => {
    const b = computeCharacter(plain(20)).abilities.str!.effectiveScore;
    const a = computeCharacter(abp(20)).abilities.str!.effectiveScore;
    expect(a - b).toBe(0);
  });
});
