import { describe, it, expect } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
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

  it("accent-bars the Combat card only (S6 Pillar 4 slice V2)", () => {
    const c = richCharacter();
    const vm = buildCharacterViewModel(c, computeCharacter(c), "owner", "public");
    render(<CharacterDashboard vm={vm} />);

    const combatRegion = screen.getByRole("region", { name: /combat/i });
    // section -> CardContent div -> Card div (same structure SectionCard's own tests assert).
    const combatCard = combatRegion.parentElement?.parentElement;
    expect(combatCard).toHaveClass("border-l-2");
    expect(combatCard).toHaveClass("border-l-gold");

    // Other SectionCards must NOT be accented — the emphasis signal is Combat-only (§3.1).
    const abilitiesRegion = screen.getByRole("region", { name: /ability scores/i });
    const abilitiesCard = abilitiesRegion.parentElement?.parentElement;
    expect(abilitiesCard).not.toHaveClass("border-l-gold");

    // BAB/CMB/CMD appear ONCE each (the MiniStat grid) — the review killed a chip row that
    // duplicated the same three values back-to-back in the same card.
    expect(within(combatRegion).getAllByText("BAB")).toHaveLength(1);
    expect(within(combatRegion).getAllByText("CMB")).toHaveLength(1);
    expect(within(combatRegion).getAllByText("CMD")).toHaveLength(1);
  });

  it("applies pf-hover-lift to the Companion card ONLY when the master link renders (owner view)", () => {
    const c = richCharacter();
    c.companion = {
      type: "familiar",
      archetype: undefined,
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
    };
    const vm = buildCharacterViewModel(c, computeCharacter(c), "owner", "public");
    render(<CharacterDashboard vm={vm} />);

    const companionRegion = screen.getByRole("region", { name: /companion/i });
    const companionCard = companionRegion.parentElement?.parentElement;
    expect(companionCard).toHaveClass("pf-hover-lift");
    // The master-link Link is a real descendant — the hover affordance matches real behavior.
    expect(within(companionRegion).getByRole("link", { name: /elandra/i })).toBeInTheDocument();

    // A PUBLIC viewer never gets master.characterId (§15) — no link renders, so the card must NOT
    // lift (a lifting card with nothing clickable is a lying affordance; review finding).
    cleanup();
    const publicVm = buildCharacterViewModel(c, computeCharacter(c), "public", "public");
    render(<CharacterDashboard vm={publicVm} />);
    const publicRegion = screen.getByRole("region", { name: /companion/i });
    const publicCard = publicRegion.parentElement?.parentElement;
    expect(publicCard).not.toHaveClass("pf-hover-lift");
    expect(within(publicRegion).queryByRole("link")).not.toBeInTheDocument();
  });
});
