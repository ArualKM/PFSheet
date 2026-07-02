import { describe, it, expect } from "vitest";
import { createDefaultCharacter, maxMythicPower, mythicSurgeDie } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled(tier: number) {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.variants.mythic = true;
  c.mythic = { tier, path: "champion", abilityBoosts: [], pathAbilities: [] };
  return c;
}

describe("mythic", () => {
  it("power pool = 3 + 2×tier; surge die scales by band", () => {
    expect(maxMythicPower(0)).toBe(0);
    expect(maxMythicPower(1)).toBe(5);
    expect(maxMythicPower(10)).toBe(23);
    expect(mythicSurgeDie(0)).toBe("");
    expect(mythicSurgeDie(3)).toBe("1d6");
    expect(mythicSurgeDie(4)).toBe("1d8");
    expect(mythicSurgeDie(7)).toBe("1d10");
    expect(mythicSurgeDie(10)).toBe("1d12");
  });

  it("summary.mythic carries tier/path/surge/power/effective-level", () => {
    const m = computeCharacter(enabled(6)).summary.mythic!;
    expect(m.tier).toBe(6);
    expect(m.path).toBe("champion");
    expect(m.surgeDie).toBe("1d8");
    expect(m.power).toEqual({ current: 15, max: 15 }); // 3 + 2×6
    expect(m.effectiveLevelBonus).toBe(3); // floor(6/2)
  });

  it("Amazing Initiative adds +tier to initiative at tier 2+, not at tier 1", () => {
    const base = computeCharacter(createDefaultCharacter({ name: "X" })).summary.initiative;
    expect(computeCharacter(enabled(1)).summary.initiative - base).toBe(0);
    expect(computeCharacter(enabled(4)).summary.initiative - base).toBe(4);
  });

  it("absent unless the variant is enabled", () => {
    expect(computeCharacter(createDefaultCharacter({ name: "X" })).summary.mythic).toBeUndefined();
  });

  it("ability boosts raise the assigned ability score (+2 each, stacking)", () => {
    const c = enabled(5);
    const baseStr = computeCharacter(c).abilities.str!.effectiveScore;
    c.mythic!.abilityBoosts = [
      { id: "b1", tier: 1, ability: "str" },
      { id: "b2", tier: 5, ability: "str" },
    ];
    expect(computeCharacter(c).abilities.str!.effectiveScore - baseStr).toBe(4);
  });

  it("Hard to Kill (tier 1+) doubles the death threshold to -2×Con", () => {
    const m = enabled(1);
    m.abilities.primary.con.score = 12; // normal death at -12, Hard to Kill at -24
    m.health.maxHp = 30;
    m.health.currentHp = -15;
    expect(computeCharacter(m).summary.hp.status).toBe("dying"); // -15 > -24

    const non = createDefaultCharacter({ name: "X" });
    non.abilities.primary.con.score = 12;
    non.health.maxHp = 30;
    non.health.currentHp = -15;
    expect(computeCharacter(non).summary.hp.status).toBe("dead"); // -15 <= -12
  });

  it("summary.mythic exposes ability-boost / path-ability counts + hardToKill", () => {
    const c = enabled(3);
    c.mythic!.abilityBoosts = [{ id: "b1", tier: 1, ability: "dex" }];
    c.mythic!.pathAbilities = [{ id: "p1", name: "Fleet Charge", category: "path" }];
    const m = computeCharacter(c).summary.mythic!;
    expect(m.abilityBoosts).toBe(1);
    expect(m.pathAbilities).toBe(1);
    expect(m.hardToKill).toBe(true);
  });

  it("tier-gated base abilities unlock cumulatively by tier", () => {
    const t1 = computeCharacter(enabled(1)).summary.mythic!.baseAbilities.map((a) => a.name);
    expect(t1).toContain("Hard to Kill");
    expect(t1).toContain("Surge");
    expect(t1).not.toContain("Amazing Initiative");
    expect(t1).not.toContain("Recuperation");

    const t5 = computeCharacter(enabled(5)).summary.mythic!.baseAbilities.map((a) => a.name);
    expect(t5).toContain("Amazing Initiative");
    expect(t5).toContain("Recuperation");
    expect(t5).toContain("Mythic Saving Throws");
    expect(t5).toContain("Force of Will");
    expect(t5).not.toContain("Unstoppable");

    const t10 = computeCharacter(enabled(10)).summary.mythic!.baseAbilities;
    expect(t10).toHaveLength(10);
    expect(t10.map((a) => a.name)).toContain("Legendary Hero");
  });
});
