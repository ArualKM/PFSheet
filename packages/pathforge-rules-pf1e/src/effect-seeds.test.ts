import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "./compute";
import { seedToAutomationEffect, seedsToAutomationEffects, normalizeEffectTarget, normalizeFormula } from "./effect-seeds";
import type { CompendiumEffectSeed } from "./effect-seeds";

const seed = (s: Partial<CompendiumEffectSeed>): CompendiumEffectSeed => ({
  target: "ac",
  op: "add",
  valueOrFormula: "1",
  bonusType: "untyped",
  notes: "",
  ...s,
});

describe("effect-seed → automation mapping", () => {
  it("normalizes abbreviated save targets to the engine vocabulary", () => {
    expect(normalizeEffectTarget("saves.fort")).toBe("saves.fortitude");
    expect(normalizeEffectTarget("saves.ref")).toBe("saves.reflex");
    expect(normalizeEffectTarget("saves.will")).toBe("saves.will"); // already fine
    expect(normalizeEffectTarget("HP.Max")).toBe("HP.Max"); // unknown alias → original (trimmed)
  });

  it("auto-applies a clean unconditional effect (formula normalized to our DSL)", () => {
    const e = seedToAutomationEffect(seed({ target: "hp.max", valueOrFormula: "@{max(3, level)}", notes: "+3 hp; +1 per HD beyond 3" }), "t1");
    expect(e.target).toBe("hp.max");
    expect(e.operation).toBe("add");
    expect(e.value).toBe("max(3, @{level})"); // author's @{whole-expr} → our func(@{path}) DSL
    expect(e.condition).toBeUndefined(); // "per HD" note is informational, not a toggle → still applies
  });

  it("normalizeFormula bridges the author convention onto our evaluator DSL", () => {
    expect(normalizeFormula("@{max(3, level)}")).toBe("max(3, @{level})");
    expect(normalizeFormula("@{floor(level/3)}")).toBe("floor(@{level}/3)");
    expect(normalizeFormula("@{wis.mod}")).toBe("@{abilities.wis.mod}");
    // already-correct formulas pass through unchanged
    expect(normalizeFormula("max(3, @{level})")).toBe("max(3, @{level})");
    expect(normalizeFormula("@{abilities.str.mod}")).toBe("@{abilities.str.mod}");
    // a multi-path formula is NOT mistaken for one wrapped expression
    expect(normalizeFormula("@{level} + @{str.mod}")).toBe("@{level} + @{abilities.str.mod}");
    // plain numbers / dice / text pass through
    expect(normalizeFormula("2")).toBe("2");
    expect(normalizeFormula("1d6")).toBe("1d6");
  });

  it("Great Fortitude / Lightning Reflexes apply after save normalization", () => {
    const fort = seedToAutomationEffect(seed({ target: "saves.fort", valueOrFormula: "2", notes: "" }), "t2");
    expect(fort.target).toBe("saves.fortitude");
    expect(fort.condition).toBeUndefined();
    const ref = seedToAutomationEffect(seed({ target: "saves.ref", valueOrFormula: "2", notes: "" }), "t3");
    expect(ref.target).toBe("saves.reflex");
    expect(ref.condition).toBeUndefined();
  });

  it("marks toggle / chosen / situational effects conditional (recorded, not auto-applied)", () => {
    const wf = seedToAutomationEffect(seed({ target: "attack", valueOrFormula: "1", notes: "chosen weapon only" }), "t4");
    expect(wf.condition).toBe("chosen weapon only");
    const pa = seedToAutomationEffect(seed({ target: "damage.melee", valueOrFormula: "2", notes: "toggle; scales with BAB" }), "t5");
    expect(pa.condition).toBeTruthy();
    const pbs = seedToAutomationEffect(seed({ target: "attack.ranged", valueOrFormula: "1", notes: "within 30 ft" }), "t6");
    expect(pbs.condition).toBe("within 30 ft");
  });

  it("refuses damage targets (no engine domain) — condition set so they can't misroute to attack", () => {
    // even with empty notes, a damage target is recorded conditionally (never applied as an attack bonus)
    const dmg = seedToAutomationEffect(seed({ target: "damage.melee", valueOrFormula: "2", notes: "" }), "t7");
    expect(dmg.condition).toBeTruthy();
    expect(dmg.target).toBe("damage.melee"); // original target preserved for the editor
  });

  it("falls back to untyped for an unknown bonus type and parses numeric values", () => {
    const e = seedToAutomationEffect(seed({ target: "ac", valueOrFormula: "1", bonusType: "made_up" }), "t8");
    expect(e.bonusType).toBe("untyped");
    expect(e.value).toBe(1); // numeric → number
  });

  it("end-to-end: a Toughness seed actually raises computed Max HP (formula resolves against the engine)", () => {
    const base = createDefaultCharacter();
    const lvl = computeCharacter(base).summary.totalLevel;
    const before = computeCharacter(base).summary.hp.max;
    base.feats.list.push({
      id: "feat-toughness",
      name: "Toughness",
      tags: [],
      automation: seedsToAutomationEffects(
        [{ target: "hp.max", op: "add", valueOrFormula: "@{max(3, level)}", bonusType: "untyped", notes: "+3 hp; +1 per HD beyond 3" }],
        "toughness",
      ),
    });
    const after = computeCharacter(base).summary.hp.max;
    expect(after).toBe(before + Math.max(3, lvl));
  });

  it("end-to-end: a conditional/toggle seed (Power Attack damage) does NOT change base totals", () => {
    const base = createDefaultCharacter();
    const beforeMelee = computeCharacter(base).attackBonuses.melee.value;
    base.feats.list.push({
      id: "feat-pa",
      name: "Power Attack",
      tags: [],
      automation: seedsToAutomationEffects(
        [{ target: "damage.melee", op: "add", valueOrFormula: "2", bonusType: "untyped", notes: "toggle; scales with BAB" }],
        "power-attack",
      ),
    });
    // damage.melee is conditional (toggle + no damage domain) → recorded but must not leak into attack
    expect(computeCharacter(base).attackBonuses.melee.value).toBe(beforeMelee);
  });

  it("generates unique ids per entry", () => {
    const out = seedsToAutomationEffects(
      [seed({ target: "ac" }), seed({ target: "saves.fort", valueOrFormula: "2" })],
      "feat-dodge",
    );
    expect(out.map((e) => e.id)).toEqual(["feat-dodge-fx-0", "feat-dodge-fx-1"]);
  });
});
