import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { CompanionSheet } from "@/components/character/companion-sheet";

/**
 * A linked familiar fixture. Archetype is "Mauler" (not "Sage") on purpose — Sage's granted
 * abilities REPLACE the standard Alertness grant (see FAMILIAR_ARCHETYPE data), which would make
 * `grantsAlertness` false and defeat the "renders an Alertness grant row" assertion below. Mauler
 * keeps Alertness + Improved Evasion untouched while still exercising the archetype/fromArchetype
 * path (Battle Form / Increased Strength at master level 3+).
 */
function familiarFixture(): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Whiskers" });
  c.identity.race = "Cat";
  c.identity.size = "Tiny";
  c.identity.alignment = "NN";
  c.combat.speed.base = "30 ft.";
  c.combat.speed.climb = "20 ft.";
  c.combat.attacks = [
    {
      id: "a1",
      name: "Bite",
      attackType: "melee",
      attackFormula: "@{combat.bab.total} + @{abilities.dex.mod} - 4",
      damageFormula: "1d3-4",
      enabled: true,
      conditionalModifiers: [],
      showInCombat: true,
    },
  ];
  c.companion = {
    type: "familiar",
    archetype: "Mauler",
    syncEnabled: true,
    master: {
      characterId: "m1",
      name: "Elandra",
      level: 5,
      bab: 3,
      hpMax: 40,
      saves: { fortitude: 4, reflex: 4, will: 5 },
      skillRanks: {},
    },
    masterBenefit: {
      effects: [{ target: "skill.stealth", value: 3 }],
      rawText: "+3 Stealth",
    },
  };
  return c;
}

describe("CompanionSheet", () => {
  it("owner view: renders identity, master link, granted abilities, and what it grants the master", () => {
    const c = familiarFixture();
    const computed = computeCharacter(c);
    const vm = buildCharacterViewModel(c, computed, "owner", "public");

    expect(vm.companion).not.toBeNull();
    expect(vm.companion!.grantsAlertness).toBe(true);
    expect(vm.companion!.masterBenefit?.effects).toEqual([{ target: "skill.stealth", value: 3 }]);

    render(<CompanionSheet vm={vm} />);

    // The page-title h1 (the mobile infobox banner also shows the name, so scope to the heading).
    expect(screen.getByRole("heading", { level: 1, name: "Whiskers" })).toBeInTheDocument();
    expect(screen.getAllByText("Mauler Familiar").length).toBeGreaterThan(0);
    // Master link (dual-rendered mobile+desktop, so use getAllByText).
    expect(screen.getAllByText(/Elandra/).length).toBeGreaterThan(0);
    // The Grants-to-master card's Alertness row.
    expect(screen.getByText(/\+2 Perception \/ \+2 Sense Motive/)).toBeInTheDocument();
    // The species-specific master benefit, formatted via formatFamiliarEffect.
    expect(screen.getByText("+3 Stealth")).toBeInTheDocument();
    // A granted special ability (standard progression, untouched by Mauler).
    expect(screen.getByText("Improved Evasion")).toBeInTheDocument();
  });

  it("public viewer sees the master's level but never its name", () => {
    const c = familiarFixture();
    const computed = computeCharacter(c);
    const vm = buildCharacterViewModel(c, computed, "public", "public");

    expect(vm.companion).not.toBeNull();
    expect(vm.companion!.master).toEqual({ level: 5 });

    render(<CompanionSheet vm={vm} />);

    expect(screen.queryByText(/Elandra/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Master · Level 5/).length).toBeGreaterThan(0);
    // The rest of the sheet still renders for a public viewer.
    expect(screen.getByRole("heading", { level: 1, name: "Whiskers" })).toBeInTheDocument();
  });

  it("hides everything companion-related when the section is private, without breaking the rest", () => {
    const c = familiarFixture();
    c.privacy.sections.companion = "private";
    const computed = computeCharacter(c);
    const vm = buildCharacterViewModel(c, computed, "public", "public");

    expect(vm.companion).toBeNull();
    expect(vm.companion?.masterBenefit).toBeUndefined();

    render(<CompanionSheet vm={vm} />);

    expect(screen.queryByText(/Elandra/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Master · Level/)).not.toBeInTheDocument();
    expect(screen.queryByText("+3 Stealth")).not.toBeInTheDocument();
    expect(screen.queryByText(/Perception \/ \+2 Sense Motive/)).not.toBeInTheDocument();
    expect(screen.queryByText("Improved Evasion")).not.toBeInTheDocument();
    expect(screen.queryByText(/Grants to Master/i)).not.toBeInTheDocument();
    // Identity + core stats (not companion-gated) still render.
    expect(screen.getByRole("heading", { level: 1, name: "Whiskers" })).toBeInTheDocument();
    expect(screen.getByText(/Armor Class/i)).toBeInTheDocument();
  });

  it("a non-familiar companion renders without the grants-to-master card", () => {
    const c = createDefaultCharacter({ name: "Rex" });
    c.companion = { type: "animal_companion" };
    const computed = computeCharacter(c);
    const vm = buildCharacterViewModel(c, computed, "owner", "public");

    expect(vm.companion).not.toBeNull();
    expect(vm.companion!.grantsAlertness).toBe(false);
    expect(vm.companion!.masterBenefit).toBeUndefined();

    render(<CompanionSheet vm={vm} />);

    expect(screen.getByRole("heading", { level: 1, name: "Rex" })).toBeInTheDocument();
    expect(screen.getAllByText("Animal Companion").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Grants to Master/i)).not.toBeInTheDocument();
  });

  it("a stale masterBenefit surviving a familiar→animal-companion type switch is not shown", () => {
    // The editor deliberately preserves companion.masterBenefit across a type switch (so switching
    // back to familiar doesn't lose the compendium-seeded benefit) — the VIEW must gate it on type.
    const c = familiarFixture();
    c.companion!.type = "animal_companion";
    c.companion!.syncEnabled = false;
    c.companion!.archetype = undefined;
    const computed = computeCharacter(c);
    const vm = buildCharacterViewModel(c, computed, "owner", "public");

    expect(vm.companion).not.toBeNull();
    expect(vm.companion!.masterBenefit).toBeUndefined();
    expect(vm.companion!.grantsAlertness).toBe(false);

    render(<CompanionSheet vm={vm} />);
    expect(screen.queryByText(/Grants to Master/i)).not.toBeInTheDocument();
    expect(screen.queryByText("+3 Stealth")).not.toBeInTheDocument();
  });

  it("an unlinked familiar's grants card shows reference copy, not 'already folded in'", () => {
    const c = familiarFixture();
    c.companion!.syncEnabled = false; // master cache + masterBenefit stay (owner turned the link off)
    const computed = computeCharacter(c);
    const vm = buildCharacterViewModel(c, computed, "owner", "public");

    expect(vm.companion!.synced).toBe(false);
    expect(vm.companion!.masterBenefit?.effects).toHaveLength(1);

    render(<CompanionSheet vm={vm} />);

    // buildFamiliarBenefit skips unlinked familiars, so nothing is folded into the master's sheet —
    // the card must not claim otherwise.
    expect(screen.queryByText(/already folded into the master/)).not.toBeInTheDocument();
    expect(screen.getByText(/master link is off/i)).toBeInTheDocument();
    expect(screen.getByText("+3 Stealth")).toBeInTheDocument();
  });
});
