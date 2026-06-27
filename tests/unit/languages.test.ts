import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { languageBudget } from "@/lib/character/languages";

function budgetFor(mutate: (c: ReturnType<typeof createDefaultCharacter>) => void) {
  const c = createDefaultCharacter({ name: "Linguist" });
  mutate(c);
  return languageBudget(c, computeCharacter(c));
}

describe("languageBudget (PF1e bonus languages)", () => {
  it("is the positive Int modifier plus Linguistics ranks", () => {
    const b = budgetFor((c) => {
      c.abilities.primary.int.score = 16; // +3
      const ling = c.skills.list.find((s) => s.key === "linguistics");
      if (ling) ling.ranks = 2;
    });
    expect(b.intBonus).toBe(3);
    expect(b.linguisticsRanks).toBe(2);
    expect(b.total).toBe(5);
  });

  it("never counts a negative Int modifier against the budget", () => {
    const b = budgetFor((c) => {
      c.abilities.primary.int.score = 7; // -2
    });
    expect(b.intBonus).toBe(0);
    expect(b.total).toBe(0);
  });

  it("counts Linguistics ranks even with no Int bonus", () => {
    const b = budgetFor((c) => {
      c.abilities.primary.int.score = 10; // +0
      const ling = c.skills.list.find((s) => s.key === "linguistics");
      if (ling) ling.ranks = 4;
    });
    expect(b.total).toBe(4);
  });
});
