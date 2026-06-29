import { describe, it, expect } from "vitest";
import { createDefaultCharacter, type AutomationEffect } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

/**
 * V1·3·1 — the feat/feature/trait automation editor writes real AutomationEffect[]s; this locks that
 * those effects reach the engine and move the computed values (the editor was previously hardcoding
 * `automation: []`, so custom feats were inert).
 */

const base = () => createDefaultCharacter({ name: "Tester" });

function withFeat(...automation: AutomationEffect[]) {
  const c = base();
  c.feats.list.push({ id: "feat_1", name: "Test Feat", tags: [], automation });
  return c;
}

describe("automation editor → engine", () => {
  const b = computeCharacter(base()).summary;

  it("a feat add-effect raises the targeted save (Iron Will: Will +2)", () => {
    const s = computeCharacter(
      withFeat({ id: "e1", target: "saves.will", operation: "add", value: 2, bonusType: "untyped" }),
    ).summary;
    expect(s.will - b.will).toBe(2);
  });

  it("subtract lowers the target", () => {
    const s = computeCharacter(
      withFeat({ id: "e1", target: "saves.reflex", operation: "subtract", value: 1, bonusType: "untyped" }),
    ).summary;
    expect(s.reflex - b.reflex).toBe(-1);
  });

  it("Toughness: an hp-target effect raises summary.hp.max", () => {
    const s = computeCharacter(
      withFeat({ id: "e1", target: "hp", operation: "add", value: 3, bonusType: "untyped" }),
    ).summary;
    expect(s.hp.max - b.hp.max).toBe(3);
  });

  it("untyped hp bonuses from a feat + a trait stack", () => {
    const c = base();
    c.feats.list.push({
      id: "feat_1",
      name: "Toughness",
      tags: [],
      automation: [{ id: "e1", target: "hp", operation: "add", value: 3, bonusType: "untyped" }],
    });
    c.traits.list.push({
      id: "trait_1",
      name: "Hardy",
      automation: [{ id: "e2", target: "hp", operation: "add", value: 1, bonusType: "untyped" }],
    });
    expect(computeCharacter(c).summary.hp.max - b.hp.max).toBe(4);
  });

  it("a formula value resolves (Will += '1 + 1')", () => {
    const s = computeCharacter(
      withFeat({ id: "e1", target: "saves.will", operation: "add", value: "1 + 1", bonusType: "untyped" }),
    ).summary;
    expect(s.will - b.will).toBe(2);
  });

  it("effects on features and traits also apply, not just feats", () => {
    const c = base();
    c.features.list.push({
      id: "fe_1",
      name: "Lucky",
      category: "class_feature",
      automation: [{ id: "e1", target: "save.all", operation: "add", value: 1, bonusType: "luck" }],
    });
    c.traits.list.push({
      id: "tr_1",
      name: "Reactionary",
      automation: [{ id: "e2", target: "combat.initiative", operation: "add", value: 2, bonusType: "trait" }],
    });
    const s = computeCharacter(c).summary;
    expect(s.fortitude - b.fortitude).toBe(1);
    expect(s.will - b.will).toBe(1);
    expect(s.initiative - b.initiative).toBe(2);
  });

  it("under Wounds & Vigor, an hp effect buffs vigor max (not the hidden hp pool)", () => {
    const wvBase = base();
    wvBase.rules.variants.woundsVigor = true;
    const baseVigor = computeCharacter(wvBase).summary.woundsVigor!.vigor.max;

    const c = base();
    c.rules.variants.woundsVigor = true;
    c.feats.list.push({
      id: "feat_1",
      name: "Toughness",
      tags: [],
      automation: [{ id: "e1", target: "hp", operation: "add", value: 3, bonusType: "untyped" }],
    });
    expect(computeCharacter(c).summary.woundsVigor!.vigor.max - baseVigor).toBe(3);
  });

  it("same-type bonuses to one target do not stack (highest wins)", () => {
    const c = base();
    c.feats.list.push({
      id: "f1",
      name: "A",
      tags: [],
      automation: [{ id: "e1", target: "saves.will", operation: "add", value: 2, bonusType: "morale" }],
    });
    c.feats.list.push({
      id: "f2",
      name: "B",
      tags: [],
      automation: [{ id: "e2", target: "saves.will", operation: "add", value: 3, bonusType: "morale" }],
    });
    expect(computeCharacter(c).summary.will - b.will).toBe(3);
  });
});
