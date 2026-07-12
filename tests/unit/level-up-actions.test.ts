import { describe, it, expect } from "vitest";
import { createDefaultCharacter, readLevelUpMeta, writeLevelUpMeta } from "@pathforge/schema";
import { buildStartLevelUpMeta } from "@/lib/character/level-up-start";

/**
 * Level-Up Wizard Stage 7 — `startLevelUpAction` (`lib/actions/characters.ts`) itself is NOT
 * exercised here. It's a thin `"use server"` wrapper — RLS-scoped Supabase read, `redirect()`,
 * a CAS update — and nothing in this repo's test suite fakes that preamble (checked: no test
 * imports `lib/actions/*` or `lib/supabase/server`/`next/headers`; the closest precedent,
 * `import-apply.test.ts`, fakes a plain PostgREST-shaped client around a PURE business-logic
 * module, `lib/character/import-apply.ts` — not a live server action with a throwing
 * `next/navigation` redirect baked in). Per the Stage 7 brief, the honest path taken here is the
 * same shape as that precedent: the interesting DECISION (what a fresh level-up session's baseline
 * should be) was extracted into a pure, directly-testable helper
 * (`lib/character/level-up-start.ts`'s `buildStartLevelUpMeta`), leaving the action itself a
 * deliberately dumb wrapper around it. These tests cover that helper, plus the specific merge-
 * semantics claim `startLevelUpAction`'s doc comment leans on (a fresh write clearing a PRIOR
 * session's `completedAt`) — verified through the real `writeLevelUpMeta`/`readLevelUpMeta` round
 * trip, not just asserted against the helper's return value in isolation.
 */

describe("buildStartLevelUpMeta — the pure meta-stamping decision", () => {
  it("stamps fromLevel from the character's CURRENT total level, targetLevel one above it", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.identity.totalLevel = 5;
    const patch = buildStartLevelUpMeta(c, 40);
    expect(patch.active).toBe(true);
    expect(patch.step).toBe("class");
    expect(patch.fromLevel).toBe(5);
    expect(patch.targetLevel).toBe(6);
  });

  it("passes through a finite computed Max HP as the starting baseline", () => {
    const c = createDefaultCharacter({ name: "X" });
    const patch = buildStartLevelUpMeta(c, 73);
    expect(patch.startingMaxHp).toBe(73);
  });

  it("guards a non-finite computed Max HP to undefined — never stamps a NaN/Infinity baseline", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(buildStartLevelUpMeta(c, Number.NaN).startingMaxHp).toBeUndefined();
    expect(buildStartLevelUpMeta(c, Number.POSITIVE_INFINITY).startingMaxHp).toBeUndefined();
    expect(buildStartLevelUpMeta(c, undefined).startingMaxHp).toBeUndefined();
  });

  it("snapshots startingClasses by id, preferring the compendium preset's name over the free-text one", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.identity.classes.push({ id: "cls_a", name: "Fighter", level: 5, presetKey: "fighter" });
    c.identity.classes.push({
      id: "cls_b",
      name: "Stale Free-Text Name",
      level: 2,
      compendiumId: "rogue",
      compendiumPreset: {
        key: "rogue",
        name: "Rogue",
        hitDie: 8,
        bab: "three_quarter",
        saves: { fortitude: "poor", reflex: "good", will: "poor" },
        skillRanksPerLevel: 8,
        classSkillKeys: [],
      },
    });

    const patch = buildStartLevelUpMeta(c, undefined);
    expect(patch.startingClasses).toEqual([
      { id: "cls_a", name: "Fighter", level: 5 },
      { id: "cls_b", name: "Rogue", level: 2 },
    ]);
  });

  it("snapshots an empty startingClasses array for a classless character, not undefined", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(buildStartLevelUpMeta(c, undefined).startingClasses).toEqual([]);
  });

  it("stamps a fresh startedAt and explicitly clears completedAt (present as an explicit undefined key)", () => {
    const c = createDefaultCharacter({ name: "X" });
    const patch = buildStartLevelUpMeta(c, undefined);
    expect(typeof patch.startedAt).toBe("string");
    expect(Object.prototype.hasOwnProperty.call(patch, "completedAt")).toBe(true);
    expect(patch.completedAt).toBeUndefined();
  });
});

describe("writeLevelUpMeta(character, buildStartLevelUpMeta(...)) — the fresh-start round trip", () => {
  it("clears a PRIOR finished session's completedAt rather than letting it survive the spread", () => {
    const c = createDefaultCharacter({ name: "X" });
    // A previously FINISHED level-up session — exactly what a character looks like right after
    // clicking Finish once already (review-step.tsx's own patch shape).
    writeLevelUpMeta(c, {
      active: false,
      step: "review",
      fromLevel: 1,
      targetLevel: 2,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T01:00:00.000Z",
    });
    expect(readLevelUpMeta(c)!.completedAt).toBe("2026-01-01T01:00:00.000Z");

    // The character has since been leveled again by hand (or this IS the level-up that just
    // finished, and the player immediately clicks "Level Up" again) — totalLevel moved to 2.
    c.identity.totalLevel = 2;
    writeLevelUpMeta(c, buildStartLevelUpMeta(c, 20));

    const fresh = readLevelUpMeta(c)!;
    expect(fresh.active).toBe(true);
    expect(fresh.completedAt).toBeUndefined();
    // The NEW session's own baseline, not the old session's stale fromLevel/targetLevel (1/2).
    expect(fresh.fromLevel).toBe(2);
    expect(fresh.targetLevel).toBe(3);
    expect(fresh.startingMaxHp).toBe(20);
  });

  it("a character with NO prior level-up meta at all starts clean (completedAt never present)", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(readLevelUpMeta(c)).toBeNull();

    writeLevelUpMeta(c, buildStartLevelUpMeta(c, 8));

    const fresh = readLevelUpMeta(c)!;
    expect(fresh.active).toBe(true);
    expect(fresh.completedAt).toBeUndefined();
    expect(fresh.fromLevel).toBe(0);
    expect(fresh.targetLevel).toBe(1);
  });
});
