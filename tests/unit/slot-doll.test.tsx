import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createDefaultCharacter, type EquipmentItem } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { SlotDoll } from "@/components/character/slot-doll";

function item(over: Partial<EquipmentItem> & { id: string; name: string }): EquipmentItem {
  return {
    category: "gear",
    quantity: 1,
    weight: 0,
    equipped: true,
    automation: [],
    modifiers: [],
    identified: true,
    ...over,
  } as EquipmentItem;
}

/** A fixture vm (built the same way every other view-model test does — createDefaultCharacter →
 * computeCharacter → buildCharacterViewModel) exercising every slot-doll state: occupied, empty,
 * tattoo-sharing, an unknown/homebrew slot, a slot collision (warning), and a held weapon. */
function fixtureVm() {
  const c = createDefaultCharacter({ name: "Anise" });
  c.inventory.gear.push(
    item({ id: "belt1", name: "Belt of Giant Strength +4", equipSlot: "belt" }),
    item({ id: "tattoo1", name: "Tattoo of the Belt", tattooSlot: "belt" }),
    item({ id: "neck1", name: "Amulet of Natural Armor +1", equipSlot: "neck" }),
    item({ id: "neck2", name: "Necklace of Fireballs", equipSlot: "neck" }),
    item({ id: "storm1", name: "Storm Sigil", equipSlot: "storm_chakra" }),
  );
  c.inventory.weapons.push(
    item({
      id: "rapier1",
      name: "Rapier +1",
      category: "weapon",
      weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 1 },
    }),
  );
  const computed = computeCharacter(c);
  return buildCharacterViewModel(c, computed, "owner");
}

describe("SlotDoll", () => {
  it("renders an occupied slot with the item name", () => {
    const vm = fixtureVm();
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    expect(screen.getByText("Belt of Giant Strength +4")).toBeInTheDocument();
  });

  it("renders unoccupied known slots as Empty", () => {
    const vm = fixtureVm();
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    // 13 known slots minus belt/neck/storm_chakra(unknown) occupied → 11 known slots empty.
    expect(screen.getAllByText("Empty")).toHaveLength(11);
  });

  it("flags a slot that also carries a tattoo without hiding the body-slot occupant", () => {
    const vm = fixtureVm();
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    expect(screen.getByText("+ Tattoo")).toBeInTheDocument();
    // Both tracks independently visible — the belt item AND the tattoo indicator coexist.
    expect(screen.getByText("Belt of Giant Strength +4")).toBeInTheDocument();
  });

  it("never drops an unknown/homebrew slot string — appended, labeled via title-case fallback", () => {
    const vm = fixtureVm();
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    expect(screen.getByText("Storm Chakra")).toBeInTheDocument();
    expect(screen.getByText("Storm Sigil")).toBeInTheDocument();
  });

  it("renders slot-collision warnings", () => {
    const vm = fixtureVm();
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    expect(screen.getByText(/Neck: 2 items equipped/)).toBeInTheDocument();
  });

  it("renders held items with a hands used/available summary", () => {
    const vm = fixtureVm();
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    expect(screen.getByText("Rapier +1")).toBeInTheDocument();
    expect(screen.getByText("Held (1/2 hands)")).toBeInTheDocument();
  });

  it("renders no warning banner when there are no warnings", () => {
    const c = createDefaultCharacter({ name: "Clean Sheet" });
    const vm = buildCharacterViewModel(c, computeCharacter(c), "owner");
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    expect(screen.queryByText(/warning/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Empty")).toHaveLength(13);
  });

  // The component renders exactly ONE slot list (no separate "desktop" vs "mobile" DOM) — the
  // silhouette glyph is CSS-hidden below `sm` (`hidden … sm:block`), decorative + aria-hidden, so
  // this single list IS both the doll's accessible representation on desktop AND the entire mobile
  // layout. Every known anatomical slot the doll tracks must appear as a row in it.
  it("the single slot list carries every known slot the doll shows (this list is also the mobile layout)", () => {
    const vm = fixtureVm();
    render(<SlotDoll slots={vm.equipmentSlots!} />);
    const knownLabels = [
      "Head",
      "Headband",
      "Eyes",
      "Neck",
      "Shoulders",
      "Body",
      "Chest",
      "Wrist",
      "Hands",
      "Belt",
      "Ring (left)",
      "Ring (right)",
      "Feet",
    ];
    for (const label of knownLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
