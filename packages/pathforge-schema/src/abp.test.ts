import { describe, it, expect } from "vitest";
import {
  prowessSlots,
  prowessAbilities,
  computeProwessBonuses,
  trackAssignments,
  MENTAL_PROWESS_LEVELS,
  PHYSICAL_PROWESS_LEVELS,
  MAX_PROWESS_PER_ABILITY,
  type AbpBlock,
  type ProwessIncrement,
} from "./abp";

/** Build a list of prowess increments from ability keys (ids don't affect computation). */
function incs(...abilities: string[]): ProwessIncrement[] {
  return abilities.map((ability, i) => ({ id: `p${i}`, ability }));
}

describe("ABP prowess — schema helpers", () => {
  it("prowess increment levels match the Unchained table", () => {
    expect([...MENTAL_PROWESS_LEVELS]).toEqual([6, 11, 13, 15, 17]);
    expect([...PHYSICAL_PROWESS_LEVELS]).toEqual([7, 12, 13, 16, 17]);
    expect(MAX_PROWESS_PER_ABILITY).toBe(3);
  });

  it("prowessAbilities returns the correct ability set per track", () => {
    expect([...prowessAbilities("mental")]).toEqual(["int", "wis", "cha"]);
    expect([...prowessAbilities("physical")]).toEqual(["str", "dex", "con"]);
  });

  it("prowessSlots counts increments unlocked at a level", () => {
    expect(prowessSlots("mental", 1)).toBe(0);
    expect(prowessSlots("mental", 5)).toBe(0);
    expect(prowessSlots("mental", 6)).toBe(1);
    expect(prowessSlots("mental", 12)).toBe(2); // 6, 11
    expect(prowessSlots("mental", 13)).toBe(3); // 6, 11, 13
    expect(prowessSlots("mental", 16)).toBe(4); // 6, 11, 13, 15
    expect(prowessSlots("mental", 20)).toBe(5); // all
    expect(prowessSlots("physical", 6)).toBe(0);
    expect(prowessSlots("physical", 7)).toBe(1);
    expect(prowessSlots("physical", 13)).toBe(3); // 7, 12, 13
    expect(prowessSlots("physical", 20)).toBe(5);
  });

  it("trackAssignments reads the right array (and tolerates an absent block)", () => {
    const block: AbpBlock = { mentalProwess: incs("int"), physicalProwess: incs("str", "dex") };
    expect(trackAssignments(block, "mental").map((i) => i.ability)).toEqual(["int"]);
    expect(trackAssignments(block, "physical").map((i) => i.ability)).toEqual(["str", "dex"]);
    expect(trackAssignments(undefined, "mental")).toEqual([]);
  });

  it("computeProwessBonuses tallies +2 per increment per ability", () => {
    const block: AbpBlock = { mentalProwess: incs("int", "int", "wis"), physicalProwess: incs("str") };
    // level 13: 3 mental slots, 3 physical slots → all assignments count
    expect(computeProwessBonuses(block, 13)).toEqual({ int: 4, wis: 2, str: 2 });
  });

  it("computeProwessBonuses ignores assignments beyond the unlocked slot count", () => {
    const block: AbpBlock = { mentalProwess: incs("int", "wis"), physicalProwess: [] };
    // level 6: only 1 mental slot → only the first assignment counts
    expect(computeProwessBonuses(block, 6)).toEqual({ int: 2 });
  });

  it("computeProwessBonuses caps a single ability at +6", () => {
    const block: AbpBlock = { mentalProwess: incs("cha", "cha", "cha", "cha"), physicalProwess: [] };
    expect(computeProwessBonuses(block, 20)).toEqual({ cha: 6 });
  });

  it("computeProwessBonuses returns an empty map for an absent block", () => {
    expect(computeProwessBonuses(undefined, 20)).toEqual({});
  });

  it("computeProwessBonuses is case-insensitive and skips blank entries", () => {
    const block: AbpBlock = { mentalProwess: incs("INT", "", "Wis"), physicalProwess: [] };
    expect(computeProwessBonuses(block, 13)).toEqual({ int: 2, wis: 2 });
  });
});
