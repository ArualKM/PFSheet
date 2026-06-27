import { describe, it, expect } from "vitest";
import { createDefaultCharacter, parseCharacter } from "@pathforge/schema";
import { computeCharacter } from "./compute";
import {
  pointBuyCost,
  pointBuySpent,
  pointBuyRemaining,
  composeAbilityScore,
} from "./point-buy";

describe("point-buy math", () => {
  it("costs the standard PF1e table edges", () => {
    expect(pointBuyCost(7)).toBe(-4);
    expect(pointBuyCost(10)).toBe(0);
    expect(pointBuyCost(14)).toBe(5);
    expect(pointBuyCost(18)).toBe(17);
    expect(pointBuyCost(6)).toBeNull();
    expect(pointBuyCost(19)).toBeNull();
  });

  it("totals spent + remaining for a classic 15-point build", () => {
    // 15,14,13,12,10,8 → 7+5+3+2+0-2 = 15
    const alloc = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    expect(pointBuySpent(alloc)).toBe(15);
    expect(pointBuyRemaining(15, alloc)).toBe(0);
  });

  it("reports negative remaining for an over-budget build", () => {
    const alloc = { str: 18, dex: 18, con: 18, int: 10, wis: 10, cha: 10 };
    expect(pointBuyRemaining(15, alloc)).toBeLessThan(0);
  });

  it("composes pre-racial + racial and the engine reads the result", () => {
    expect(composeAbilityScore(15, 2, 0)).toBe(17);
    const c = createDefaultCharacter();
    c.abilities.primary.str.score = composeAbilityScore(15, 2, 0); // 17
    const computed = computeCharacter(c);
    expect(computed.abilities.str!.effectiveScore).toBe(17);
    expect(computed.abilities.str!.modifier).toBe(3); // floor((17-10)/2)
  });

  it("round-trips point-buy state losslessly through parseCharacter", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.str.pointBuyBase = 16;
    c.abilities.pointBuy = {
      enabled: true,
      done: false,
      budget: 20,
      system: "standard",
      minScore: 7,
      maxScore: 18,
      allocations: { str: 16, dex: 14 },
      racial: { str: 2 },
    };
    // Go through the real Zod validator (deep-cloned, like a save→load).
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.abilities.pointBuy?.allocations.str).toBe(16);
    expect(parsed.abilities.pointBuy?.racial.str).toBe(2);
    expect(parsed.abilities.pointBuy?.budget).toBe(20);
    expect(parsed.abilities.primary.str.pointBuyBase).toBe(16);
  });

  it("parses an old sheet with no point-buy block (back-compat)", () => {
    const parsed = parseCharacter(JSON.parse(JSON.stringify(createDefaultCharacter())));
    expect(parsed.abilities.pointBuy).toBeUndefined();
  });
});
