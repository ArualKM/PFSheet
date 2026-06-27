import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "milestone_leveling", enabled: true, settings: {} });
  return c;
}

describe("milestone leveling", () => {
  it("tracks cumulative milestones toward the next-level threshold", () => {
    const c = enabled();
    c.milestoneLeveling = { current: 0, nextThreshold: 3, jobs: [] };
    expect(computeCharacter(c).summary.milestoneLeveling).toEqual({
      current: 0,
      nextThreshold: 3,
      remaining: 3,
      readyToLevel: false,
    });
  });

  it("flags ready-to-level when the running total reaches the threshold", () => {
    const c = enabled();
    // The example: at level 3 you need 3; a medium job (worth 3) takes you to 3/3 → level up.
    c.milestoneLeveling = { current: 3, nextThreshold: 3, jobs: [] };
    const ms = computeCharacter(c).summary.milestoneLeveling!;
    expect(ms.readyToLevel).toBe(true);
    expect(ms.remaining).toBe(0);
  });

  it("milestones are cumulative — they carry across level-ups (3/8 toward level 5)", () => {
    const c = enabled();
    c.milestoneLeveling = { current: 3, nextThreshold: 8, jobs: [] };
    const ms = computeCharacter(c).summary.milestoneLeveling!;
    expect(ms).toEqual({ current: 3, nextThreshold: 8, remaining: 5, readyToLevel: false });
  });

  it("a zero threshold never reads as ready (avoids a 0/0 false positive)", () => {
    const c = enabled();
    c.milestoneLeveling = { current: 0, nextThreshold: 0, jobs: [] };
    expect(computeCharacter(c).summary.milestoneLeveling!.readyToLevel).toBe(false);
  });

  it("is absent from the summary unless the module is enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.milestoneLeveling = { current: 5, nextThreshold: 8, jobs: [] };
    expect(computeCharacter(c).summary.milestoneLeveling).toBeUndefined();
  });
});
