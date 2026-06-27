import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { CharacterDashboard } from "@/components/character/character-dashboard";

function richCharacter() {
  const c = createDefaultCharacter({ name: "Seraphina Vale" });
  c.identity.race = "Aasimar";
  c.identity.alignment = "LG";
  c.identity.classes = [{ id: "c1", name: "Paladin", level: 5 }];
  c.identity.totalLevel = 5;
  c.profile.quote = "I keep my promises.";
  c.abilities.primary.str = { key: "str", label: "Strength", score: 18, baseScore: 18 };
  c.combat.bab = { total: 5, progression: "full" };
  c.combat.attacks = [
    {
      id: "a1",
      name: "+1 Longsword",
      attackType: "melee",
      attackFormula: "@{combat.bab.total} + @{abilities.str.mod}",
      damageFormula: "1d8+7",
      enabled: true,
      conditionalModifiers: [],
      showInCombat: true,
    },
  ];
  c.buffs.active = [{ id: "b1", name: "Haste", enabled: true, effects: [] }];
  c.feats.list = [{ id: "f1", name: "Power Attack", tags: [], automation: [] }];
  c.spellcasting.casters = [
    {
      id: "sc1",
      className: "Paladin",
      casterType: "prepared",
      casterLevel: 2,
      concentrationFormula: "",
      castingAbility: "cha",
      conditionalModifiers: [],
      spellsPerDay: {},
      bonusSpells: {},
      saveDcFormula: "",
      autoSlots: false,
    },
  ];
  const perception = c.skills.list.find((s) => s.key === "perception");
  if (perception) {
    perception.ranks = 5;
    perception.classSkill = true;
  }
  return c;
}

describe("CharacterDashboard", () => {
  it("renders the full owner dashboard without errors", () => {
    const c = richCharacter();
    const vm = buildCharacterViewModel(c, computeCharacter(c), "owner", "public");
    render(<CharacterDashboard vm={vm} />);

    expect(screen.getByText("Seraphina Vale")).toBeInTheDocument();
    expect(screen.getByText("Paladin 5")).toBeInTheDocument();
    expect(screen.getByText("+1 Longsword")).toBeInTheDocument();
    expect(screen.getByText("Haste")).toBeInTheDocument();
    expect(screen.getByText("Power Attack")).toBeInTheDocument();
    expect(screen.getByText("Perception")).toBeInTheDocument();
    expect(screen.getByText(/Armor Class/i)).toBeInTheDocument();
  });

  it("omits restricted sections in the public view model", () => {
    const c = richCharacter();
    c.privacy.sections.buffs = "owner_only";
    const vm = buildCharacterViewModel(c, computeCharacter(c), "anonymous", "public");
    render(<CharacterDashboard vm={vm} />);
    // Buffs are hidden from anonymous viewers; the privacy note appears instead.
    expect(screen.queryByText("Haste")).not.toBeInTheDocument();
    expect(screen.getByText(/hidden by the owner/i)).toBeInTheDocument();
  });
});
