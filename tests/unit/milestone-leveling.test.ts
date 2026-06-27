import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  milestoneRequirementForLevel,
  milestoneJobReward,
  MILESTONE_REQUIREMENTS,
  MILESTONE_MAX_LEVEL,
} from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled(level: number) {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "milestone_leveling", enabled: true, settings: {} });
  c.identity.totalLevel = level;
  return c;
}

describe("milestone requirement + reward tables (transcription)", () => {
  it("requirement ladder matches the campaign table", () => {
    // Spot-check the published cumulative thresholds.
    expect(milestoneRequirementForLevel(3)).toBe(0);
    expect(milestoneRequirementForLevel(4)).toBe(3);
    expect(milestoneRequirementForLevel(5)).toBe(8);
    expect(milestoneRequirementForLevel(10)).toBe(61);
    expect(milestoneRequirementForLevel(16)).toBe(243);
    expect(milestoneRequirementForLevel(20)).toBe(501);
    expect(milestoneRequirementForLevel(21)).toBe(576);
    // Ladder is non-decreasing.
    for (let l = 2; l <= MILESTONE_MAX_LEVEL; l++) {
      expect(MILESTONE_REQUIREMENTS[l]!).toBeGreaterThanOrEqual(MILESTONE_REQUIREMENTS[l - 1]!);
    }
  });

  it("job rewards match the difficulty matrix", () => {
    expect(milestoneJobReward(3, "easy")).toBe(1);
    expect(milestoneJobReward(3, "medium")).toBe(3);
    expect(milestoneJobReward(3, "hard")).toBe(4);
    expect(milestoneJobReward(3, "deadly")).toBe(6);
    expect(milestoneJobReward(8, "deadly")).toBe(20);
    expect(milestoneJobReward(12, "medium")).toBe(15);
    expect(milestoneJobReward(20, "deadly")).toBe(50);
    // Below level 3 every job is worth 0.
    expect(milestoneJobReward(2, "deadly")).toBe(0);
  });

  it("clamps out-of-range levels to the table edges", () => {
    expect(milestoneRequirementForLevel(0)).toBe(0);
    expect(milestoneRequirementForLevel(99)).toBe(576);
    expect(milestoneJobReward(99, "easy")).toBe(12); // clamps to level 20
  });
});

describe("milestone leveling engine", () => {
  it("derives the threshold from the class level (level 3 → 0/3 to reach level 4)", () => {
    const c = enabled(3);
    c.milestoneLeveling = { current: 0, log: [] };
    const ms = computeCharacter(c).summary.milestoneLeveling!;
    expect(ms.level).toBe(3);
    expect(ms.nextLevel).toBe(4);
    expect(ms.nextThreshold).toBe(3);
    expect(ms.remaining).toBe(3);
    expect(ms.readyToLevel).toBe(false);
  });

  it("flags ready when the running total reaches the next threshold", () => {
    const c = enabled(3);
    c.milestoneLeveling = { current: 3, log: [] }; // medium job (3) at level 3 → 3/3
    expect(computeCharacter(c).summary.milestoneLeveling!.readyToLevel).toBe(true);
  });

  it("milestones carry across level-ups (level 4, total 3 → 3/8 toward level 5)", () => {
    const c = enabled(4);
    c.milestoneLeveling = { current: 3, log: [] };
    const ms = computeCharacter(c).summary.milestoneLeveling!;
    expect(ms.nextThreshold).toBe(8);
    expect(ms.currentThreshold).toBe(3);
    expect(ms.intoLevel).toBe(0); // 3 − 3
    expect(ms.span).toBe(5); // 8 − 3
    expect(ms.remaining).toBe(5);
    expect(ms.readyToLevel).toBe(false);
  });

  it("is NOT ready at levels 1-2 where the ladder requires 0 milestones (no false positive)", () => {
    for (const level of [1, 2]) {
      const c = enabled(level);
      c.milestoneLeveling = { current: 0, log: [] };
      const ms = computeCharacter(c).summary.milestoneLeveling!;
      expect(ms.span).toBe(0); // no milestones needed for the next level yet
      expect(ms.readyToLevel).toBe(false);
    }
  });

  it("a brand-new sheet (totalLevel 0 → level 1) is not flagged ready", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.rules.modules.push({ key: "milestone_leveling", enabled: true, settings: {} });
    // totalLevel defaults to 0; engine maps it to level 1.
    const ms = computeCharacter(c).summary.milestoneLeveling!;
    expect(ms.level).toBe(1);
    expect(ms.readyToLevel).toBe(false);
  });

  it("caps at the top of the ladder (no next threshold, never ready)", () => {
    const c = enabled(MILESTONE_MAX_LEVEL);
    c.milestoneLeveling = { current: 9999, log: [] };
    const ms = computeCharacter(c).summary.milestoneLeveling!;
    expect(ms.atCap).toBe(true);
    expect(ms.readyToLevel).toBe(false);
  });

  it("is absent from the summary unless the module is enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.milestoneLeveling = { current: 5, log: [] };
    expect(computeCharacter(c).summary.milestoneLeveling).toBeUndefined();
  });
});
