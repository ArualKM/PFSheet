import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  readLevelUpMeta,
  writeLevelUpMeta,
  resumeLevelUpStepFor,
  featsOwedAtLevel,
  asiCountAtLevel,
  LEVEL_UP_STEP_KEYS,
  LEVEL_UP_ORDER_VERSION,
  type LevelUpMeta,
} from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

describe("startingClasses (Stage 3/4 baseline snapshot)", () => {
  it("round-trips through readLevelUpMeta and defaults to absent (never guessed)", () => {
    const c = createDefaultCharacter({ name: "X" });
    writeLevelUpMeta(c, {
      active: true,
      step: "class",
      fromLevel: 3,
      targetLevel: 7,
      startedAt: "2026-07-12T00:00:00.000Z",
    });
    expect(readLevelUpMeta(c)!.startingClasses).toBeUndefined();

    writeLevelUpMeta(c, {
      startingClasses: [
        { id: "cls_fighter", name: "Fighter", level: 3 },
        { id: "cls_rogue", name: "Rogue", level: 2 },
      ],
    });
    expect(readLevelUpMeta(c)!.startingClasses).toEqual([
      { id: "cls_fighter", name: "Fighter", level: 3 },
      { id: "cls_rogue", name: "Rogue", level: 2 },
    ]);
  });
});

describe("featsOwedAtLevel / asiCountAtLevel (advisory UI-hint math, never engine-enforced)", () => {
  it("a 3→7 catch-up owes 2 feats (levels 5 and 7) and 1 ASI (crossing level 4) in one pass", () => {
    expect(featsOwedAtLevel(7) - featsOwedAtLevel(3)).toBe(2);
    expect(asiCountAtLevel(7) - asiCountAtLevel(3)).toBe(1);
  });

  it("a 4→5 level-up owes 1 feat (odd level 5) and 0 ASI (no new /4 boundary crossed)", () => {
    expect(featsOwedAtLevel(5) - featsOwedAtLevel(4)).toBe(1);
    expect(asiCountAtLevel(5) - asiCountAtLevel(4)).toBe(0);
  });

  it("a 3→4 level-up owes 0 feats (4 is even) and 1 ASI (crossing level 4)", () => {
    expect(featsOwedAtLevel(4) - featsOwedAtLevel(3)).toBe(0);
    expect(asiCountAtLevel(4) - asiCountAtLevel(3)).toBe(1);
  });

  it("featsOwedAtLevel is 0 below level 1 (no negative/zero-level feat)", () => {
    expect(featsOwedAtLevel(0)).toBe(0);
    expect(featsOwedAtLevel(-1)).toBe(0);
  });

  it("asiCountAtLevel never goes negative", () => {
    expect(asiCountAtLevel(0)).toBe(0);
    expect(asiCountAtLevel(3)).toBe(0);
  });
});

describe("level-up flag (level-up.ts)", () => {
  it("readLevelUpMeta returns null for a character that never started a level-up session", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(c.metadata.custom.levelUp).toBeUndefined();
    expect(readLevelUpMeta(c)).toBeNull();
  });

  it("readLevelUpMeta returns null on garbage stored under the key", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.metadata.custom.levelUp = { active: "not-a-boolean", step: "not-a-real-step" };
    expect(readLevelUpMeta(c)).toBeNull();
  });

  it("writeLevelUpMeta round-trips through readLevelUpMeta", () => {
    const c = createDefaultCharacter({ name: "X" });
    writeLevelUpMeta(c, {
      active: true,
      step: "hp",
      fromLevel: 5,
      targetLevel: 6,
      startingMaxHp: 42,
      startedAt: "2026-07-12T00:00:00.000Z",
    });

    const meta = readLevelUpMeta(c);
    expect(meta).toMatchObject({
      active: true,
      step: "hp",
      fromLevel: 5,
      targetLevel: 6,
      startingMaxHp: 42,
      startedAt: "2026-07-12T00:00:00.000Z",
      order: LEVEL_UP_ORDER_VERSION,
    });
  });

  it("writeLevelUpMeta merges a partial patch over existing meta, preserving untouched fields", () => {
    const c = createDefaultCharacter({ name: "X" });
    writeLevelUpMeta(c, {
      active: true,
      step: "class",
      fromLevel: 3,
      targetLevel: 7,
      startedAt: "2026-07-12T00:00:00.000Z",
    });

    const advanced = writeLevelUpMeta(c, { step: "asi" });
    expect(advanced.step).toBe("asi");
    // Untouched fields survive the patch.
    expect(advanced.fromLevel).toBe(3);
    expect(advanced.targetLevel).toBe(7);
    expect(advanced.active).toBe(true);
    expect(advanced.startedAt).toBe("2026-07-12T00:00:00.000Z");
    // Every write re-stamps the order.
    expect(advanced.order).toBe(LEVEL_UP_ORDER_VERSION);
  });

  it("a fresh write does NOT default active to true (unlike writeWizardMeta) — an omitted patch stays inactive", () => {
    const c = createDefaultCharacter({ name: "X" });
    const written = writeLevelUpMeta(c, {});
    expect(written.active).toBe(false);
    expect(written.step).toBe("class");
  });

  it("a fresh write with no prior meta and an omitted fromLevel/targetLevel defaults both to 0, not a throw", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(() => writeLevelUpMeta(c, { active: true })).not.toThrow();
    const written = readLevelUpMeta(c)!;
    expect(written.fromLevel).toBe(0);
    expect(written.targetLevel).toBe(0);
  });
});

describe("resumeLevelUpStepFor", () => {
  const meta = (step: LevelUpMeta["step"], order?: number): LevelUpMeta => ({
    active: true,
    step,
    fromLevel: 3,
    targetLevel: 7,
    startedAt: "2026-07-12T00:00:00.000Z",
    ...(order != null ? { order } : {}),
  });

  it("branch 1 — an order mismatch (missing or stale stamp) resumes at the first visible key", () => {
    const visible: readonly LevelUpMeta["step"][] = ["class", "hp", "skills", "review"];
    expect(resumeLevelUpStepFor(meta("skills"), visible)).toBe("class");
    expect(resumeLevelUpStepFor(meta("skills", 0), visible)).toBe("class");
  });

  it("branch 2 — a current-order checkpoint whose stored step is still visible resumes at itself", () => {
    const visible: readonly LevelUpMeta["step"][] = ["class", "hp", "skills", "asi", "review"];
    expect(resumeLevelUpStepFor(meta("skills", LEVEL_UP_ORDER_VERSION), visible)).toBe("skills");
    expect(resumeLevelUpStepFor(meta("asi", LEVEL_UP_ORDER_VERSION), visible)).toBe("asi");
  });

  it("branch 2 — a stored step that's no longer visible walks forward to the next visible one", () => {
    // "feats" is hidden this session (no feat owed); "asi" is the next visible key after it.
    const visible: readonly LevelUpMeta["step"][] = ["class", "hp", "skills", "asi", "review"];
    expect(resumeLevelUpStepFor(meta("feats", LEVEL_UP_ORDER_VERSION), visible)).toBe("asi");
  });

  it("branch 3 — a stored step with nothing visible after it resumes at the LAST visible key", () => {
    // "spells" is stored, but neither "spells" nor anything after it is visible this session.
    const visible: readonly LevelUpMeta["step"][] = ["class", "hp", "skills", "review"];
    expect(resumeLevelUpStepFor(meta("spells", LEVEL_UP_ORDER_VERSION), visible)).toBe("review");
  });

  it("branch 4 — an empty visible-key list falls back to 'class' rather than throwing", () => {
    expect(() => resumeLevelUpStepFor(meta("hp", LEVEL_UP_ORDER_VERSION), [])).not.toThrow();
    expect(resumeLevelUpStepFor(meta("hp", LEVEL_UP_ORDER_VERSION), [])).toBe("class");
  });

  it("LEVEL_UP_STEP_KEYS still starts with class and ends with review (sanity anchor for the walk)", () => {
    expect(LEVEL_UP_STEP_KEYS[0]).toBe("class");
    expect(LEVEL_UP_STEP_KEYS[LEVEL_UP_STEP_KEYS.length - 1]).toBe("review");
  });
});

/** Fixture mirroring mythic.test.ts's `enabled()` helper — no module toggles at all, proving ASI
 * needs none. */
function withAsi(increases: { id: string; level: number; ability: string }[]) {
  const c = createDefaultCharacter({ name: "X" });
  c.abilities.abilityIncreases = increases;
  return c;
}

describe("ASI engine loop (compute.ts, mirrors the mythic ability-boost precedent)", () => {
  it("one increase to str raises the effective str score by exactly 1", () => {
    const base = computeCharacter(createDefaultCharacter({ name: "X" })).abilities.str!.effectiveScore;
    const c = withAsi([{ id: "a1", level: 4, ability: "str" }]);
    expect(computeCharacter(c).abilities.str!.effectiveScore - base).toBe(1);
  });

  it("two increases to the same ability stack to +2 total (RAW: cumulative, untyped)", () => {
    const base = computeCharacter(createDefaultCharacter({ name: "X" })).abilities.dex!.effectiveScore;
    const c = withAsi([
      { id: "a1", level: 4, ability: "dex" },
      { id: "a2", level: 8, ability: "dex" },
    ]);
    expect(computeCharacter(c).abilities.dex!.effectiveScore - base).toBe(2);
  });

  it("applies with ZERO optional modules enabled — proves there is no isModuleKeyEnabled gate", () => {
    const c = withAsi([{ id: "a1", level: 12, ability: "wis" }]);
    expect(c.rules.modules).toHaveLength(0);
    expect(c.rules.variants).toEqual({});
    const base = computeCharacter(createDefaultCharacter({ name: "X" })).abilities.wis!.effectiveScore;
    expect(computeCharacter(c).abilities.wis!.effectiveScore - base).toBe(1);
  });
});
