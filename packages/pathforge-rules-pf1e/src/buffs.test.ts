import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  findBuffTemplate,
  type ActiveBuff,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { computeCharacter } from "./compute";
import { detectStackingConflicts, activeBuffDelta, previewBuffEffects } from "./buffs";

function active(templateId: string, overrides: Partial<ActiveBuff> = {}): ActiveBuff {
  const t = findBuffTemplate(templateId);
  if (!t) throw new Error(`no template ${templateId}`);
  return {
    id: t.id,
    templateId: t.id,
    name: t.name,
    enabled: true,
    category: t.category,
    effects: t.effects,
    duration: t.defaultDuration,
    ...overrides,
  };
}

function charWith(buffs: ActiveBuff[]): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Buff Test" });
  c.buffs.active = buffs;
  return c;
}

describe("buff effects feed the compute engine", () => {
  it("baseline default character has AC 10 / Reflex 0 / speed 30", () => {
    const r = computeCharacter(createDefaultCharacter({ name: "Base" }));
    expect(r.summary.ac).toBe(10);
    expect(r.summary.reflex).toBe(0);
    expect(r.summary.speed.total).toBe(30);
    expect(r.attackBonuses.melee.value).toBe(0);
  });

  it("Haste modifies AC, Reflex, attack, and speed (acceptance criterion)", () => {
    const r = computeCharacter(charWith([active("tpl_haste")]));
    expect(r.summary.ac).toBe(11); // +1 dodge
    expect(r.summary.reflex).toBe(1); // +1 dodge
    expect(r.summary.speed.total).toBe(60); // +30 ft
    expect(r.attackBonuses.melee.value).toBe(1); // +1 attack
    expect(r.attackBonuses.ranged.value).toBe(1);
  });

  it("a disabled buff contributes nothing", () => {
    const r = computeCharacter(charWith([active("tpl_haste", { enabled: false })]));
    expect(r.summary.ac).toBe(10);
    expect(r.summary.speed.total).toBe(30);
    expect(r.attackBonuses.melee.value).toBe(0);
  });

  it("ability-boosting buffs cascade (Bull's Strength → STR mod → melee)", () => {
    const r = computeCharacter(charWith([active("tpl_bulls_strength")]));
    expect(r.abilities.str?.effectiveScore).toBe(14);
    expect(r.abilities.str?.modifier).toBe(2);
    expect(r.attackBonuses.melee.value).toBe(2); // STR mod cascades into melee to-hit
  });

  it("penalty conditions reduce stats (Fatigued → STR/DEX −2)", () => {
    const r = computeCharacter(charWith([active("tpl_fatigued")]));
    expect(r.abilities.str?.effectiveScore).toBe(8);
    expect(r.abilities.dex?.modifier).toBe(-1);
  });
});

describe("stacking conflicts", () => {
  it("same-type buff bonuses do not stack and are flagged", () => {
    const c = charWith([active("tpl_bless"), active("tpl_heroism")]);
    const r = computeCharacter(c);
    // Bless (+1 morale) and Heroism (+2 morale) on attack → only +2 applies.
    expect(r.attackBonuses.melee.value).toBe(2);

    const conflicts = detectStackingConflicts(c);
    const attackConflict = conflicts.find((x) => x.domain === "Attack" && x.bonusType === "morale");
    expect(attackConflict).toBeTruthy();
    expect(attackConflict?.suppressed.some((s) => s.label === "Bless")).toBe(true);
    expect(attackConflict?.winner?.label).toBe("Heroism");
  });

  it("dodge bonuses stack (no conflict)", () => {
    const c = charWith([active("tpl_haste"), active("tpl_haste", { id: "haste2" })]);
    const conflicts = detectStackingConflicts(c);
    expect(conflicts.some((x) => x.bonusType === "dodge")).toBe(false);
  });
});

describe("affected-values preview", () => {
  it("activeBuffDelta reports a buff's contribution", () => {
    const c = charWith([active("tpl_haste")]);
    const rows = activeBuffDelta(c, "tpl_haste");
    expect(rows.find((r) => r.label === "Speed")?.delta).toBe(30);
    expect(rows.find((r) => r.label === "AC")?.delta).toBe(1);
    expect(rows.find((r) => r.label === "Reflex")?.delta).toBe(1);
  });

  it("previewBuffEffects shows the marginal effect of adding a template", () => {
    const base = createDefaultCharacter({ name: "Preview" });
    const haste = findBuffTemplate("tpl_haste")!;
    const rows = previewBuffEffects(base, haste.effects, "Haste");
    expect(rows.find((r) => r.label === "Speed")?.after).toBe(60);
    expect(rows.find((r) => r.label === "AC")?.delta).toBe(1);
  });
});

describe("review hardening", () => {
  it("sheet enhancement does not stack with a same-typed ability buff", () => {
    const c = charWith([active("tpl_bulls_strength")]); // +4 enhancement STR
    c.abilities.primary.str.enhancement = 4; // sheet enhancement, same type
    expect(computeCharacter(c).abilities.str?.effectiveScore).toBe(14); // max(4,4), not 18
  });

  it("sheet inherent does not stack with a same-typed ability buff", () => {
    const c = createDefaultCharacter({ name: "Inherent" });
    c.abilities.primary.str.inherent = 2;
    c.buffs.active = [
      {
        id: "ib",
        name: "Inherent buff",
        enabled: true,
        effects: [{ id: "fx", target: "abilities.str", operation: "add", value: 2, bonusType: "inherent" }],
      },
    ];
    expect(computeCharacter(c).abilities.str?.effectiveScore).toBe(12); // max(2,2), not 14
  });

  it("Haste speed is an enhancement bonus — two Hastes don't stack speed", () => {
    const c = charWith([active("tpl_haste"), active("tpl_haste", { id: "haste2" })]);
    expect(computeCharacter(c).summary.speed.total).toBe(60); // 30 + max(30, 30)
  });

  it("flags cross-bucket attack conflicts (attack.all vs attack.melee)", () => {
    const c = charWith([
      active("tpl_bless"), // +1 morale on "attack" (all)
      {
        id: "gb",
        name: "Greater Bless",
        enabled: true,
        effects: [{ id: "fx", target: "attack.melee", operation: "add", value: 3, bonusType: "morale" }],
      },
    ]);
    expect(computeCharacter(c).attackBonuses.melee.value).toBe(3); // morale max, Bless suppressed
    const conflicts = detectStackingConflicts(c);
    expect(
      conflicts.some((x) => x.bonusType === "morale" && x.suppressed.some((s) => s.label === "Bless")),
    ).toBe(true);
  });
});
