import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  parseCharacter,
  oathsBlockSchema,
  parseOathPoints,
  type OathsBlock,
} from "@pathforge/schema";
import { computeCharacter, computeOaths } from "@pathforge/rules-pf1e";

const emptyBlock = (): OathsBlock => ({ oaths: [], boons: [], bonusPoints: 0 });

function base() {
  const c = createDefaultCharacter({ name: "Oathbound" });
  c.rules.modules.push({ key: "oaths", enabled: true, settings: {} });
  return c;
}

describe("oaths — schema", () => {
  it("parses an empty block to clean defaults", () => {
    expect(oathsBlockSchema.parse({})).toEqual(emptyBlock());
  });

  it("existing sheets parse unchanged (no oaths block)", () => {
    const c = createDefaultCharacter({ name: "Vanilla" });
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.oaths).toBeUndefined();
  });

  it("round-trips a populated block", () => {
    const c = base();
    c.oaths = {
      oaths: [
        {
          id: "o1",
          name: "Oath against Harm",
          compendiumId: "3pp:oath-against-harm",
          points: 4,
          oathText: "You have sworn never to take the life of a living creature.",
          defiancePenalty: "You feel the pain of those you hurt.",
          atonement: "Recompense the wronged.",
        },
        { id: "o2", name: "Forbidden Knowledge", points: 1, notes: "Oath points: see text", custom: true },
      ],
      boons: [
        { id: "b1", name: "Accelerated Recovery", compendiumId: "3pp:accelerated-recovery", cost: 3, boonType: "Su" },
      ],
      bonusPoints: 1,
      notes: "GM granted +1 for the campaign vow.",
    };
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.oaths).toEqual(c.oaths);
  });

  it("parseOathPoints handles numeric cells and keeps non-numeric raw ('see text')", () => {
    expect(parseOathPoints("1")).toEqual({ points: 1 });
    expect(parseOathPoints("10")).toEqual({ points: 10 });
    expect(parseOathPoints(" 4 ")).toEqual({ points: 4 });
    expect(parseOathPoints("see text")).toEqual({ points: 1, raw: "see text" });
    expect(parseOathPoints("")).toEqual({ points: 1 });
    expect(parseOathPoints(null)).toEqual({ points: 1 });
    expect(parseOathPoints(undefined)).toEqual({ points: 1 });
  });
});

describe("oaths — the Oath-point budget", () => {
  it("earned = Σ oath points + bonusPoints; spent = Σ boon costs", () => {
    const c = base();
    c.oaths = {
      oaths: [
        { id: "o1", name: "Oath against Harm", points: 4 },
        { id: "o2", name: "Oath of Abstention", points: 1 },
      ],
      boons: [
        { id: "b1", name: "Accelerated Recovery", cost: 3 },
        { id: "b2", name: "Advanced Ability", cost: 1 },
      ],
      bonusPoints: 2,
    };
    const oaths = computeCharacter(c).summary.oaths!;
    expect(oaths).toEqual({
      pointsEarned: 7,
      pointsSpent: 4,
      available: 3,
      bonusPoints: 2,
      oathCount: 2,
      boonCount: 2,
      warnings: [],
    });
  });

  it("overspending goes negative and warns (never blocks)", () => {
    const c = base();
    c.oaths = {
      oaths: [{ id: "o1", name: "Oath of Abstention", points: 1 }],
      boons: [{ id: "b1", name: "Accelerated Recovery", cost: 3 }],
      bonusPoints: 0,
    };
    const oaths = computeCharacter(c).summary.oaths!;
    expect(oaths.available).toBe(-2);
    expect(oaths.warnings.some((w) => w.includes("Overspent"))).toBe(true);
  });

  it("a negative bonusPoints adjustment lowers the earned total", () => {
    const c = base();
    c.oaths = {
      oaths: [{ id: "o1", name: "Oath against Harm", points: 4 }],
      boons: [],
      bonusPoints: -1,
    };
    const oaths = computeOaths(c)!;
    expect(oaths.pointsEarned).toBe(3);
    expect(oaths.available).toBe(3);
  });

  it("module off → no summary", () => {
    const c = createDefaultCharacter({ name: "Vanilla" });
    c.oaths = {
      oaths: [{ id: "o1", name: "Oath against Harm", points: 4 }],
      boons: [],
      bonusPoints: 0,
    };
    expect(computeCharacter(c).summary.oaths).toBeUndefined();
    expect(computeOaths(c)).toBeUndefined();
  });

  it("absent when the module is enabled but no block exists", () => {
    expect(computeCharacter(base()).summary.oaths).toBeUndefined();
  });

  it("an empty block computes clean zeros", () => {
    const c = base();
    c.oaths = emptyBlock();
    const oaths = computeCharacter(c).summary.oaths!;
    expect(oaths).toEqual({
      pointsEarned: 0,
      pointsSpent: 0,
      available: 0,
      bonusPoints: 0,
      oathCount: 0,
      boonCount: 0,
      warnings: [],
    });
  });
});
