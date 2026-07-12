import { describe, it, expect } from "vitest";
import { createDefaultCharacter, safeParseCharacter, type EquipmentItem } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

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

describe("computeEquipmentSlots — Track A (wondrous body slots)", () => {
  it("two items in the same slot warn, and BOTH keep functioning (nothing dropped)", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(
      item({
        id: "b1",
        name: "Belt of Tumbling",
        equipSlot: "belt",
        modifiers: [{ id: "m1", label: "Tumbling", value: 2, bonusType: "competence", target: "skill.acrobatics", enabled: true }],
      }),
      item({
        id: "b2",
        name: "Belt of Giant Strength",
        equipSlot: "belt",
        modifiers: [{ id: "m2", label: "Giant Strength", value: 4, bonusType: "enhancement", target: "abilities.str", enabled: true }],
      }),
    );
    const computed = computeCharacter(c);
    const slots = computed.summary.equipmentSlots;
    expect(slots.bySlot.belt).toHaveLength(2);
    expect(slots.warnings).toContain(
      "Belt: 2 items equipped (Belt of Tumbling, Belt of Giant Strength)",
    );
    // Both items' own automation still computes — a slot collision is a warning, never a block.
    expect(computed.summary.abilityMods.str).toBeGreaterThan(0);
    expect(computed.skills.acrobatics?.value).toBeGreaterThan(0);
  });

  it("a single occupant in a slot never warns", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(item({ id: "b1", name: "Belt of Tumbling", equipSlot: "belt" }));
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.bySlot.belt).toHaveLength(1);
    expect(slots.warnings).toEqual([]);
  });

  it("an unequipped item in a slot is ignored entirely", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(
      item({ id: "b1", name: "Belt A", equipSlot: "belt" }),
      item({ id: "b2", name: "Belt B", equipSlot: "belt", equipped: false }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.bySlot.belt).toHaveLength(1);
    expect(slots.warnings).toEqual([]);
  });

  it("an unknown/homebrew slot string is still tracked + grouped, never rejected", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(
      item({ id: "s1", name: "Storm Sigil A", equipSlot: "storm_chakra" }),
      item({ id: "s2", name: "Storm Sigil B", equipSlot: "storm_chakra" }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.bySlot.storm_chakra).toHaveLength(2);
    expect(slots.warnings).toEqual(["Storm Chakra: 2 items equipped (Storm Sigil A, Storm Sigil B)"]);
  });
});

describe("computeEquipmentSlots — Track B (tattoos, independent of Track A)", () => {
  it("a belt item + a belt tattoo coexist with NO warning (independent tracks)", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(
      item({ id: "b1", name: "Belt of Tumbling", equipSlot: "belt" }),
      item({ id: "t1", name: "Tattoo of the Belt", tattooSlot: "belt" }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.bySlot.belt).toHaveLength(1);
    expect(slots.tattoosBySlot.belt).toHaveLength(1);
    expect(slots.warnings).toEqual([]);
  });

  it("two tattoos in the same tattoo slot warn", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(
      item({ id: "t1", name: "Tattoo A", tattooSlot: "belt" }),
      item({ id: "t2", name: "Tattoo B", tattooSlot: "belt" }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.warnings).toEqual(["Belt tattoo: 2 tattoos equipped (Tattoo A, Tattoo B)"]);
  });
});

describe("computeEquipmentSlots — Track C (armor / shield)", () => {
  it("two equipped armor pieces warn", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.armorAndShields.push(
      item({ id: "a1", name: "Chain Shirt", category: "armor" }),
      item({ id: "a2", name: "Breastplate", category: "armor" }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.armorCount).toBe(2);
    expect(slots.warnings).toEqual(["Armor: 2 items equipped (Chain Shirt, Breastplate)"]);
  });

  it("two equipped shields warn", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.armorAndShields.push(
      item({ id: "s1", name: "Heavy Steel Shield", category: "shield" }),
      item({ id: "s2", name: "Buckler", category: "shield" }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.shieldCount).toBe(2);
    expect(slots.warnings).toEqual(["Shield: 2 items equipped (Heavy Steel Shield, Buckler)"]);
  });

  it("one armor + one shield is fine (no warning)", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.armorAndShields.push(
      item({ id: "a1", name: "Chain Shirt", category: "armor" }),
      item({ id: "s1", name: "Heavy Steel Shield", category: "shield" }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.armorCount).toBe(1);
    expect(slots.shieldCount).toBe(1);
    expect(slots.warnings).toEqual([]);
  });
});

describe("computeEquipmentSlots — Track D (hands)", () => {
  it("three one-handed weapons exceed the default 2 hands and warn", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.weapons.push(
      item({ id: "w1", name: "Dagger 1", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 } }),
      item({ id: "w2", name: "Dagger 2", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 } }),
      item({ id: "w3", name: "Dagger 3", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 } }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.handsUsed).toBe(3);
    expect(slots.handsAvailable).toBe(2);
    expect(slots.held).toHaveLength(3);
    expect(slots.warnings).toEqual(["Hands: 3 used exceeds 2 available (Dagger 1, Dagger 2, Dagger 3)"]);
  });

  it("a two-handed weapon alone uses 2 hands and does not warn against the default 2", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.weapons.push(
      item({ id: "w1", name: "Greatsword", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "two", enhancement: 0 } }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.handsUsed).toBe(2);
    expect(slots.held).toEqual([{ id: "w1", name: "Greatsword", hands: 2 }]);
    expect(slots.warnings).toEqual([]);
  });

  it("a non-weapon held item (staff) uses heldSlot, not weapon.handed", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(item({ id: "staff1", name: "Quarterstaff of Power", heldSlot: "two_hand" }));
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.handsUsed).toBe(2);
    expect(slots.held).toEqual([{ id: "staff1", name: "Quarterstaff of Power", hands: 2 }]);
  });

  it("handsAvailable defaults to 2 and can be overridden via inventory.settings", () => {
    const c1 = createDefaultCharacter({ name: "X" });
    expect(computeCharacter(c1).summary.equipmentSlots.handsAvailable).toBe(2);

    const c2 = createDefaultCharacter({ name: "Y" });
    c2.inventory.settings.handsAvailable = 4;
    c2.inventory.weapons.push(
      item({ id: "w1", name: "Dagger 1", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 } }),
      item({ id: "w2", name: "Dagger 2", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 } }),
      item({ id: "w3", name: "Dagger 3", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 } }),
    );
    const slots2 = computeCharacter(c2).summary.equipmentSlots;
    expect(slots2.handsAvailable).toBe(4);
    expect(slots2.handsUsed).toBe(3);
    expect(slots2.warnings).toEqual([]); // 3 ≤ 4, no over-commit
  });
});

describe("computeEquipmentSlots — Stage-1 review fixes", () => {
  it("one row with quantity 2 in a slot warns like two rows would (quantity-aware occupancy)", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(
      item({ id: "r1", name: "Ring of Protection +1", quantity: 2, equipSlot: "ring_left" }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.warnings).toContain("Ring (left): 2 items equipped (Ring of Protection +1)");
  });

  it("an equipped shield occupies a hand: greatsword + heavy shield over-commits 2 hands", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.weapons.push(
      item({
        id: "w1",
        name: "Greatsword",
        category: "weapon",
        weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "two", enhancement: 0 },
      }),
    );
    c.inventory.armorAndShields.push(
      item({ id: "s1", name: "Heavy Steel Shield", category: "shield", armorBonus: 2 }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.handsUsed).toBe(3);
    expect(slots.warnings.some((w) => w.startsWith("Hands: 3 used exceeds 2"))).toBe(true);
  });

  it("a buckler is the RAW exception — greatsword + buckler stays at 2 hands, no warning", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.weapons.push(
      item({
        id: "w1",
        name: "Greatsword",
        category: "weapon",
        weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "two", enhancement: 0 },
      }),
    );
    c.inventory.armorAndShields.push(item({ id: "s1", name: "Darkwood Buckler", category: "shield", armorBonus: 1 }));
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots.handsUsed).toBe(2);
    expect(slots.warnings).toHaveLength(0);
  });

  it("auraStrength tolerates statblock casing/oddities — 'Faint (special)' round-trips, never fails the parse", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(
      item({ id: "g1", name: "Odd Trinket", wondrous: { auraStrength: "Faint (special)" } }),
    );
    const parsed = safeParseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.character.inventory.gear.find((g) => g.id === "g1")?.wondrous?.auraStrength).toBe(
        "Faint (special)",
      );
    }
  });
});

describe("computeEquipmentSlots — regression: nothing set anywhere → zero warnings, summary present", () => {
  it("a brand-new default character has an empty, warning-free equipmentSlots summary", () => {
    const c = createDefaultCharacter({ name: "X" });
    const slots = computeCharacter(c).summary.equipmentSlots;
    expect(slots).toEqual({
      bySlot: {},
      tattoosBySlot: {},
      held: [],
      handsUsed: 0,
      handsAvailable: 2,
      armorCount: 0,
      shieldCount: 0,
      warnings: [],
    });
  });

  it("existing (pre-Stage-1) equipped items with no slot/held fields produce zero warnings", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.gear.push(item({ id: "ring1", name: "Ring of Protection +1", category: "magic_item" }));
    c.inventory.weapons.push(
      item({ id: "w1", name: "Longsword", category: "weapon", weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 } }),
    );
    const slots = computeCharacter(c).summary.equipmentSlots;
    // The weapon still counts toward hands (Track D reads weapon.handed unconditionally), but no
    // slot fields were set, so bySlot/tattoosBySlot stay empty and there's no over-commit warning.
    expect(slots.bySlot).toEqual({});
    expect(slots.tattoosBySlot).toEqual({});
    expect(slots.handsUsed).toBe(1);
    expect(slots.warnings).toEqual([]);
  });
});

describe("schema round-trip — new inventory fields", () => {
  it("safeParseCharacter round-trips equipSlot/tattooSlot/heldSlot/wondrous/compendiumId/weaponGroup/armorType", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.weapons.push(
      item({
        id: "w1",
        name: "Flaming Longsword",
        category: "weapon",
        equipSlot: undefined,
        compendiumId: "magic_item:flaming-longsword",
        weapon: {
          ranged: false,
          attackAbility: "str",
          damageAbility: "str",
          handed: "one",
          enhancement: 1,
          weaponGroup: "Heavy Blades",
        },
      }),
    );
    c.inventory.armorAndShields.push(
      item({
        id: "a1",
        name: "Mithral Breastplate",
        category: "armor",
        armorType: "medium",
        armorBonus: 6,
      }),
    );
    c.inventory.gear.push(
      item({
        id: "belt1",
        name: "Belt of Giant Strength +4",
        category: "magic_item",
        equipSlot: "belt",
        tattooSlot: undefined,
        heldSlot: undefined,
        compendiumId: "magic_item:belt-of-giant-strength-4",
        wondrous: {
          auraSchool: "transmutation",
          auraStrength: "moderate",
          casterLevel: 8,
          constructionRequirements: "Craft Wondrous Item, bull's strength",
          constructionCost: "8,000 gp",
        },
      }),
      item({
        id: "staff1",
        name: "Quarterstaff of Power",
        category: "magic_item",
        heldSlot: "two_hand",
      }),
    );

    const raw = JSON.parse(JSON.stringify(c));
    const result = safeParseCharacter(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.inventory.weapons[0]).toMatchObject({
      compendiumId: "magic_item:flaming-longsword",
      weapon: expect.objectContaining({ weaponGroup: "Heavy Blades" }),
    });
    expect(result.character.inventory.armorAndShields[0]).toMatchObject({
      armorType: "medium",
    });
    expect(result.character.inventory.gear[0]).toMatchObject({
      equipSlot: "belt",
      compendiumId: "magic_item:belt-of-giant-strength-4",
      wondrous: {
        auraSchool: "transmutation",
        auraStrength: "moderate",
        casterLevel: 8,
        constructionRequirements: "Craft Wondrous Item, bull's strength",
        constructionCost: "8,000 gp",
      },
    });
    expect(result.character.inventory.gear[1]).toMatchObject({ heldSlot: "two_hand" });
  });

  it("inventory.settings backfills handsAvailable=2 when absent from parsed input", () => {
    const raw = JSON.parse(JSON.stringify(createDefaultCharacter({ name: "X" })));
    delete raw.inventory.settings;
    const result = safeParseCharacter(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.inventory.settings).toEqual({ handsAvailable: 2 });
  });

  it("inventory.settings backfills handsAvailable=2 when settings is an empty object", () => {
    const raw = JSON.parse(JSON.stringify(createDefaultCharacter({ name: "X" })));
    raw.inventory.settings = {};
    const result = safeParseCharacter(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.inventory.settings.handsAvailable).toBe(2);
  });
});
