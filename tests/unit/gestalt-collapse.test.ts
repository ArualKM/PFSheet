import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  recomputeClassDerived,
  gestaltLevel,
  gestaltTracksCollapsed,
  gestaltTrackClassCounts,
  splitGestaltTracks,
  computeMaxHpFromLevels,
  isGestalt,
} from "@pathforge/schema";

/** Fighter 20 (full BAB, good Fort) + Wizard 20 (½ BAB, good Will), Con 14. */
function twoClassGestalt(opts: { split: boolean; fractional?: boolean } = { split: false }) {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
  c.rules.variants.fractionalBabSaves = opts.fractional || undefined;
  c.abilities.primary.con.score = 14;
  c.identity.classes = [
    { id: "f", name: "Fighter", level: 20, presetKey: "fighter", hitDie: "d10", ...(opts.split ? { track: "a" as const } : {}) },
    { id: "w", name: "Wizard", level: 20, presetKey: "wizard", hitDie: "d6", ...(opts.split ? { track: "b" as const } : {}) },
  ];
  c.identity.totalLevel = gestaltLevel(c);
  return c;
}

describe("gestalt track collapse (the 'all levels as class levels' bug)", () => {
  it("detects collapse when both classes default onto track A", () => {
    const c = twoClassGestalt({ split: false });
    expect(gestaltTrackClassCounts(c)).toEqual({ a: 2, b: 0 });
    expect(gestaltTracksCollapsed(c)).toBe(true);
  });

  it("is NOT collapsed once the classes are split across A/B", () => {
    const c = twoClassGestalt({ split: true });
    expect(gestaltTrackClassCounts(c)).toEqual({ a: 1, b: 1 });
    expect(gestaltTracksCollapsed(c)).toBe(false);
  });

  it("detects collapse when every class is on track B", () => {
    const c = twoClassGestalt({ split: false });
    c.identity.classes.forEach((cl) => (cl.track = "b"));
    expect(gestaltTrackClassCounts(c)).toEqual({ a: 0, b: 2 });
    expect(gestaltTracksCollapsed(c)).toBe(true);
  });

  it("a preset-less class parked on the other track does NOT mask a real two-preset collapse", () => {
    const c = twoClassGestalt({ split: false }); // Fighter + Wizard both default → track A (both preset)
    c.identity.classes.push({ id: "x", name: "Homebrew", level: 1, track: "b" }); // no preset
    // Row counts look split ({a:2,b:1}) but the two DERIVABLE classes are both on A → still collapsed.
    expect(gestaltTrackClassCounts(c)).toEqual({ a: 2, b: 1 });
    expect(gestaltTracksCollapsed(c)).toBe(true);
  });

  it("is NOT flagged for a valid one-track multiclass with the other track populated", () => {
    const c = createDefaultCharacter({ name: "V" });
    c.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
    c.identity.classes = [
      { id: "f", name: "Fighter", level: 10, presetKey: "fighter", track: "a" },
      { id: "r", name: "Rogue", level: 10, presetKey: "rogue", track: "a" }, // Fighter/Rogue multiclass on A
      { id: "w", name: "Wizard", level: 20, presetKey: "wizard", track: "b" }, // Wizard on B
    ];
    expect(gestaltTracksCollapsed(c)).toBe(false);
    recomputeClassDerived(c, { hpMethod: "manual" });
    expect(c.identity.totalLevel).toBe(20); // max(20, 20)
  });

  it("is NOT flagged for a single class or a non-gestalt character", () => {
    const one = twoClassGestalt({ split: false });
    one.identity.classes = [one.identity.classes[0]!];
    expect(gestaltTracksCollapsed(one)).toBe(false);

    const plain = createDefaultCharacter({ name: "Y" });
    plain.identity.classes = [
      { id: "f", name: "Fighter", level: 5, presetKey: "fighter" },
      { id: "w", name: "Wizard", level: 5, presetKey: "wizard" },
    ];
    expect(gestaltTracksCollapsed(plain)).toBe(false); // gestalt module not enabled
  });

  it("collapsed recompute sums both class lines and warns (the reported symptom)", () => {
    const c = twoClassGestalt({ split: false });
    const { warnings } = recomputeClassDerived(c, { hpMethod: "manual" });
    // Both class lines counted as real levels: 20 + 20.
    expect(c.identity.totalLevel).toBe(40);
    expect(c.combat.bab.total).toBe(30); // Fighter 20 + Wizard 10
    expect(c.defenses.savingThrows.fortitude.base).toBe(18); // good(12) + poor(6) summed
    expect(c.defenses.savingThrows.will.base).toBe(18);
    expect(warnings.some((w) => /one track/i.test(w))).toBe(true);
  });

  it("splitGestaltTracks + recompute yields best-of-A/B, no warning (fractional-independent)", () => {
    for (const fractional of [false, true]) {
      const c = twoClassGestalt({ split: false, fractional });
      splitGestaltTracks(c);
      c.identity.totalLevel = gestaltLevel(c);
      const { warnings } = recomputeClassDerived(c, { hpMethod: "manual" });
      expect(gestaltTrackClassCounts(c)).toEqual({ a: 1, b: 1 });
      expect(c.identity.totalLevel).toBe(20); // best track, not 40
      expect(c.combat.bab.total).toBe(20); // max(Fighter 20, Wizard 10)
      expect(c.defenses.savingThrows.fortitude.base).toBe(12); // Fighter good Fort, not summed
      expect(c.defenses.savingThrows.will.base).toBe(12); // Wizard good Will
      expect(c.defenses.savingThrows.reflex.base).toBe(6); // both poor
      expect(warnings.some((w) => /one track/i.test(w))).toBe(false);
    }
  });

  it("splitGestaltTracks alternates a,b,a for 3+ classes", () => {
    const c = twoClassGestalt({ split: false });
    c.identity.classes.push({ id: "r", name: "Rogue", level: 10, presetKey: "rogue" });
    splitGestaltTracks(c);
    expect(c.identity.classes.map((x) => x.track)).toEqual(["a", "b", "a"]);
  });

  // ── Editor-handler equivalents (the composed schema ops behind the toggle + Split button) ──

  it("auto-split on gestalt ENABLE lands on correct best-of-A/B numbers (not the summed collapse)", () => {
    const c = twoClassGestalt({ split: false }); // gestalt on, both classes default → track A
    // Mirror OptionalRulesEditor.toggleRule's gestalt-on branch.
    if (isGestalt(c) && gestaltTracksCollapsed(c)) splitGestaltTracks(c);
    c.identity.totalLevel = gestaltLevel(c);
    recomputeClassDerived(c, { hpMethod: "manual" });
    expect(c.identity.totalLevel).toBe(20);
    expect(c.combat.bab.total).toBe(20);
    expect(c.defenses.savingThrows.fortitude.base).toBe(12);
    expect(gestaltTracksCollapsed(c)).toBe(false);
  });

  it("Split HEALS an auto-computed (collapsed) Max HP but LEAVES a hand-entered one", () => {
    // Auto case: maxHp was applied from the collapsed (both-tracks-summed) pool.
    const c = twoClassGestalt({ split: false });
    const collapsedAvg = computeMaxHpFromLevels(c, "average", c.identity.classes).total;
    c.health.maxHp = collapsedAvg;
    // Mirror the GestaltCollapseBanner split handler.
    const applySplit = (ch: typeof c) => {
      const before = ch.health.maxHp;
      const autoMethod =
        before === computeMaxHpFromLevels(ch, "average", ch.identity.classes).total
          ? "average"
          : before === computeMaxHpFromLevels(ch, "max", ch.identity.classes).total
            ? "max"
            : null;
      splitGestaltTracks(ch);
      ch.identity.totalLevel = gestaltLevel(ch);
      recomputeClassDerived(ch, { hpMethod: autoMethod ?? "manual" });
      return autoMethod;
    };
    expect(applySplit(c)).toBe("average");
    const betterTrackAvg = computeMaxHpFromLevels(c, "average", c.identity.classes.filter((x) => x.track !== "b")).total;
    expect(c.health.maxHp).toBe(betterTrackAvg);
    expect(c.health.maxHp).toBeLessThan(collapsedAvg); // no longer the summed pool

    // Manual case: a hand-entered maxHp matching neither pool survives the split untouched.
    const c2 = twoClassGestalt({ split: false });
    c2.health.maxHp = 999;
    expect(applySplit(c2)).toBe(null);
    expect(c2.health.maxHp).toBe(999);
  });
});
