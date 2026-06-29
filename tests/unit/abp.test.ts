import { describe, it, expect } from "vitest";
import { createDefaultCharacter, parseCharacter, computeProwessBonuses } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { threeWayMerge } from "@/lib/character/merge";

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

  it("prowess (ability) bonuses are NOT auto-applied — enabling ABP alone assigns nothing", () => {
    const b = computeCharacter(plain(20)).abilities.str!.effectiveScore;
    const a = computeCharacter(abp(20)).abilities.str!.effectiveScore;
    expect(a - b).toBe(0);
  });
});

/** Build prowess increments from ability keys. */
function incs(...abilities: string[]) {
  return abilities.map((ability, i) => ({ id: `p${i}`, ability }));
}

describe("ABP — Mental/Physical Prowess (player-assigned)", () => {
  it("an assigned mental prowess +2 raises the ability's effective score", () => {
    const base = computeCharacter(abp(6)).abilities.int!.effectiveScore;
    const c = abp(6);
    c.abp = { mentalProwess: incs("int"), physicalProwess: [] };
    expect(computeCharacter(c).abilities.int!.effectiveScore - base).toBe(2);
  });

  it("two increments on one ability stack to +4 (single enhancement mod, not two non-stacking +2s)", () => {
    const base = computeCharacter(abp(11)).abilities.wis!.effectiveScore;
    const c = abp(11);
    c.abp = { mentalProwess: incs("wis", "wis"), physicalProwess: [] };
    expect(computeCharacter(c).abilities.wis!.effectiveScore - base).toBe(4);
  });

  it("a physical prowess +2 enhancement does NOT stack with an item enhancement bonus (highest wins)", () => {
    const c = abp(7);
    c.abilities.primary.str.enhancement = 2; // e.g. a Belt of Giant Strength +2
    const withItemOnly = computeCharacter(c).abilities.str!.effectiveScore;
    c.abp = { mentalProwess: [], physicalProwess: incs("str") }; // ABP prowess +2 (also enhancement)
    const withBoth = computeCharacter(c).abilities.str!.effectiveScore;
    expect(withBoth - withItemOnly).toBe(0); // same type → highest of the two +2s, not +4
  });

  it("respects the slots unlocked at level — extra assignments are ignored until level-up", () => {
    const c = abp(6); // only the level-6 mental increment is unlocked (1 slot)
    c.abp = { mentalProwess: incs("int", "int"), physicalProwess: [] };
    const base = computeCharacter(abp(6)).abilities.int!.effectiveScore;
    expect(computeCharacter(c).abilities.int!.effectiveScore - base).toBe(2); // only 1 of 2 applies
  });

  it("does nothing when ABP is disabled, even with assignments present", () => {
    const c = plain(20);
    c.abp = { mentalProwess: incs("int", "int", "int"), physicalProwess: incs("str") };
    const base = computeCharacter(plain(20));
    const got = computeCharacter(c);
    expect(got.abilities.int!.effectiveScore).toBe(base.abilities.int!.effectiveScore);
    expect(got.abilities.str!.effectiveScore).toBe(base.abilities.str!.effectiveScore);
  });

  it("caps a single ability at +6 (three increments) even if more are assigned to it", () => {
    const c = abp(20); // all 5 mental increments unlocked
    c.abp = { mentalProwess: incs("cha", "cha", "cha", "cha"), physicalProwess: [] };
    const base = computeCharacter(abp(20)).abilities.cha!.effectiveScore;
    expect(computeCharacter(c).abilities.cha!.effectiveScore - base).toBe(6); // +6, not +8
  });

  it("prowess survives a concurrent 3-way merge without collapsing duplicate increments", () => {
    // Entity-array model: two +2-to-INT increments are distinct ids, so a set-merge can't dedupe them.
    const baseC = parseCharacter(structuredClone(abp(13)));
    baseC.abp = { mentalProwess: incs("int"), physicalProwess: [] };
    const mine = parseCharacter(structuredClone(baseC));
    mine.abp!.mentalProwess.push({ id: "m2", ability: "int" }); // mine: a 2nd +2 to INT (→ +4)
    const theirs = parseCharacter(structuredClone(baseC));
    theirs.abp!.mentalProwess.push({ id: "t2", ability: "wis" }); // theirs: a +2 to WIS
    const { merged, conflicts } = threeWayMerge(baseC, mine, theirs);
    expect(conflicts).toHaveLength(0);
    expect(computeProwessBonuses(merged.abp, 13)).toEqual({ int: 4, wis: 2 });
  });
});
