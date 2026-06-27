import { describe, it, expect } from "vitest";
import { iterativeAttackBonuses } from "@/lib/character/combat";

describe("iterativeAttackBonuses (PF1e full-attack)", () => {
  it("BAB 0–5 grants a single attack", () => {
    expect(iterativeAttackBonuses(5, 1)).toEqual([5]);
    expect(iterativeAttackBonuses(7, 5)).toEqual([7]);
  });

  it("BAB 6 grants two attacks at -5", () => {
    expect(iterativeAttackBonuses(8, 6)).toEqual([8, 3]);
  });

  it("BAB 11 grants three, BAB 16 grants four", () => {
    expect(iterativeAttackBonuses(11, 11)).toEqual([11, 6, 1]);
    expect(iterativeAttackBonuses(20, 16)).toEqual([20, 15, 10, 5]);
  });

  it("caps at four attacks and handles non-positive BAB", () => {
    expect(iterativeAttackBonuses(25, 25)).toHaveLength(4);
    expect(iterativeAttackBonuses(2, 0)).toEqual([2]);
  });
});
