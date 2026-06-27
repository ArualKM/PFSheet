import { describe, it, expect } from "vitest";
import { createDefaultCharacter, safeParseCharacter, DEFAULT_FORMULAS } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

/** Mirrors the editor's addAttack handler in combat-editor.tsx. */
function addAttack(c: ReturnType<typeof createDefaultCharacter>) {
  c.combat.attacks.push({
    id: "atk_test",
    name: "New attack",
    attackType: "melee",
    attackFormula: DEFAULT_FORMULAS.attack.melee,
    damageFormula: "1d6",
    enabled: true,
    conditionalModifiers: [],
    showInCombat: true,
  });
}

describe("save round-trip (server action data path) after adding an attack", () => {
  it("a default character + a new attack still parses and computes (no silent save failure)", () => {
    const c = createDefaultCharacter({ name: "Tester" });
    addAttack(c);
    // a few extra edits like a real session
    c.combat.speed.base = "40 ft";
    c.identity.name = "Tester McTest";

    // The server action does exactly this before the DB write:
    const parsed = safeParseCharacter(c);
    expect(parsed.ok).toBe(true);
    expect(() => computeCharacter(parsed.ok ? parsed.character : c)).not.toThrow();
  });

  it("two attacks + a manual attack-type change parse + compute", () => {
    const c = createDefaultCharacter({ name: "Tester" });
    addAttack(c);
    addAttack(c);
    // change the second attack's type the way the editor does
    const a = c.combat.attacks[1]!;
    a.attackType = "ranged";
    a.attackFormula = DEFAULT_FORMULAS.attack.ranged;

    const parsed = safeParseCharacter(c);
    expect(parsed.ok).toBe(true);
    expect(() => computeCharacter(parsed.ok ? parsed.character : c)).not.toThrow();
  });
});
