import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  parseCharacter,
  akashicBlockSchema,
  parseVeilSlots,
  akashicVeilweavingDefault,
  KNOWN_CHAKRA_SLOTS,
  type AkashicBlock,
  type AkashicClassEntry,
  type AkashicVeilRef,
  type ShapedVeil,
} from "@pathforge/schema";
import { computeCharacter, akashicCapacityCap, akashicEssencePool } from "@pathforge/rules-pf1e";

const akClass = (over: Partial<AkashicClassEntry> & { id: string }): AkashicClassEntry => ({
  className: "",
  classLevel: 0,
  veilweavingAbility: "cha",
  unlockedBinds: [],
  ...over,
});

const veil = (over: Partial<AkashicVeilRef> & { id: string; name: string }): AkashicVeilRef => ({
  slots: [],
  ...over,
});

const shaped = (over: Partial<ShapedVeil> & { id: string; veilId: string }): ShapedVeil => ({
  slot: "",
  essenceInvested: 0,
  bound: false,
  enabled: true,
  automation: [],
  ...over,
});

const emptyBlock = (): AkashicBlock => ({
  classes: [],
  veilsKnown: [],
  shaped: [],
  otherReceptacles: [],
  temporaryEssence: 0,
});

function base(level = 7) {
  const c = createDefaultCharacter({ name: "Veilweaver" });
  c.rules.modules.push({ key: "akashic", enabled: true, settings: {} });
  c.identity.totalLevel = level;
  return c;
}

describe("akashic — schema", () => {
  it("parses an empty block to clean defaults", () => {
    const block = akashicBlockSchema.parse({});
    expect(block).toEqual(emptyBlock());
  });

  it("existing sheets parse unchanged (no akashic block)", () => {
    const c = createDefaultCharacter({ name: "Vanilla" });
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.akashic).toBeUndefined();
  });

  it("round-trips a populated block, incl. nonstandard slot strings", () => {
    const c = base(5);
    c.akashic = {
      ...emptyBlock(),
      classes: [
        akClass({ id: "a1", className: "Stormbound", classLevel: 5, essenceMax: 5, capacityBonus: 1, unlockedBinds: ["Storm"] }),
      ],
      veilsKnown: [
        veil({ id: "v1", name: "Riding Gale", slots: ["Storm", "Interface"], effect: "…", bindEffect: "…", source: "City of 7 Seraphs" }),
      ],
      shaped: [
        shaped({
          id: "s1",
          veilId: "v1",
          classId: "a1",
          slot: "Storm",
          essenceInvested: 1,
          capacityBonus: 1,
          bound: true,
          automation: [{ id: "e1", target: "speed", operation: "add", value: "5 * @{essenceInvested}" }],
        }),
      ],
      otherReceptacles: [{ id: "r1", label: "Shape Form Bind (feat)", essenceInvested: 1 }],
      temporaryEssence: 2,
    };
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.akashic).toEqual(c.akashic);
  });

  it("parseVeilSlots comma-splits + trims the compendium's free-text slot cell", () => {
    expect(parseVeilSlots("Hands, Wrists")).toEqual(["Hands", "Wrists"]);
    expect(parseVeilSlots("Storm")).toEqual(["Storm"]);
    expect(parseVeilSlots(" Head ,  Headband ")).toEqual(["Head", "Headband"]);
    expect(parseVeilSlots("")).toEqual([]);
    expect(parseVeilSlots(null)).toEqual([]);
    expect(parseVeilSlots(undefined)).toEqual([]);
  });

  it("veilweaving defaults: GROUNDED classes map, variants word-match, everything else cha", () => {
    expect(akashicVeilweavingDefault("Vizier")).toBe("int");
    expect(akashicVeilweavingDefault("Vizier Retold")).toBe("int");
    expect(akashicVeilweavingDefault("guru")).toBe("wis");
    expect(akashicVeilweavingDefault("Daevic (Wrath)")).toBe("cha");
    expect(akashicVeilweavingDefault("Stormbound")).toBe("cha");
    expect(akashicVeilweavingDefault("")).toBe("cha");
  });

  it("KNOWN_CHAKRA_SLOTS is the canonical 12-slot ordered list", () => {
    expect(KNOWN_CHAKRA_SLOTS).toHaveLength(12);
    expect(KNOWN_CHAKRA_SLOTS[0]).toBe("hands");
    expect(KNOWN_CHAKRA_SLOTS).toContain("ring");
    expect(KNOWN_CHAKRA_SLOTS).toContain("blood");
  });
});

describe("akashic — essence pool accounting", () => {
  it("total = Σ class pools + temporary; invested = enabled shaped + other receptacles", () => {
    const c = base(10);
    c.akashic = {
      ...emptyBlock(),
      classes: [
        akClass({ id: "a1", className: "Vizier", classLevel: 8, essenceMax: 10 }),
        akClass({ id: "a2", className: "Guru", classLevel: 2, essenceMax: 6 }),
      ],
      veilsKnown: [veil({ id: "v1", name: "A" }), veil({ id: "v2", name: "B" }), veil({ id: "v3", name: "C" })],
      shaped: [
        shaped({ id: "s1", veilId: "v1", slot: "hands", essenceInvested: 2 }),
        shaped({ id: "s2", veilId: "v2", slot: "feet", essenceInvested: 2 }),
        shaped({ id: "s3", veilId: "v3", slot: "head", essenceInvested: 5, enabled: false }),
      ],
      otherReceptacles: [{ id: "r1", label: "Essence of the Immortal", essenceInvested: 4 }],
      temporaryEssence: 2,
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.essence).toEqual({ total: 18, invested: 8, available: 10, temporary: 2, capacityCap: 2 });
    expect(ak.veilsKnownCount).toBe(3);
    // The disabled over-cap veil is flagged on its row but contributes no pool essence or warning.
    expect(ak.shaped[2]!.overCapacity).toBe(true);
    expect(ak.warnings).toEqual([]);
    expect(akashicEssencePool(c)).toEqual({ total: 18, invested: 8, available: 10, temporary: 2 });
  });

  it("over-investing goes negative and warns (invested, never blocked)", () => {
    const c = base(6);
    c.akashic = {
      ...emptyBlock(),
      classes: [akClass({ id: "a1", className: "Guru", classLevel: 3, essenceMax: 3 })],
      veilsKnown: [veil({ id: "v1", name: "Fistful of Daggers" })],
      shaped: [shaped({ id: "s1", veilId: "v1", slot: "hands", essenceInvested: 2 })],
      otherReceptacles: [{ id: "r1", label: "Ring", essenceInvested: 2 }],
      temporaryEssence: -1,
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.essence.total).toBe(2);
    expect(ak.essence.available).toBe(-2);
    expect(ak.warnings.some((w) => w.includes("Over-invested"))).toBe(true);
  });
});

describe("akashic — capacity cap by character level", () => {
  it("bands at 1-5 → 1, 6-11 → 2, 12-17 → 3, 18+ → 4", () => {
    expect(akashicCapacityCap(0)).toBe(1);
    expect(akashicCapacityCap(1)).toBe(1);
    expect(akashicCapacityCap(5)).toBe(1);
    expect(akashicCapacityCap(6)).toBe(2);
    expect(akashicCapacityCap(11)).toBe(2);
    expect(akashicCapacityCap(12)).toBe(3);
    expect(akashicCapacityCap(17)).toBe(3);
    expect(akashicCapacityCap(18)).toBe(4);
    expect(akashicCapacityCap(20)).toBe(4);
  });

  it("flags + warns per shaped veil over the cap; the same investment is legal a band later", () => {
    const withInvested = (level: number) => {
      const c = base(level);
      c.akashic = {
        ...emptyBlock(),
        classes: [akClass({ id: "a1", className: "Vizier", classLevel: level, essenceMax: 10 })],
        veilsKnown: [veil({ id: "v1", name: "Crown of the Victor" })],
        shaped: [shaped({ id: "s1", veilId: "v1", slot: "head", essenceInvested: 2 })],
      };
      return computeCharacter(c).summary.akashic!;
    };
    const atL5 = withInvested(5);
    expect(atL5.essence.capacityCap).toBe(1);
    expect(atL5.shaped[0]!.effectiveCap).toBe(1);
    expect(atL5.shaped[0]!.overCapacity).toBe(true);
    expect(atL5.warnings.some((w) => w.includes("capacity cap"))).toBe(true);
    const atL6 = withInvested(6);
    expect(atL6.shaped[0]!.overCapacity).toBe(false);
    expect(atL6.warnings).toEqual([]);
  });

  // "Improved essence capacity +N" is a standard class feature (Vizier L3/11/19, 38 of 66 prod
  // akashic classes) — the class's capacityBonus + the receptacle's own bonus raise the per-veil
  // effective cap so legal investments stop warning; the BASE band is unchanged.
  it("class + receptacle capacityBonus raise the per-veil effective cap", () => {
    const c = base(3); // L1-5 band → base cap 1
    c.akashic = {
      ...emptyBlock(),
      classes: [akClass({ id: "vz", className: "Vizier", classLevel: 3, essenceMax: 5, capacityBonus: 1 })],
      veilsKnown: [veil({ id: "v1", name: "Crown of the Victor" }), veil({ id: "v2", name: "Gorget of the Wyrm" })],
      shaped: [
        shaped({ id: "s1", veilId: "v1", slot: "head", essenceInvested: 2 }), // ≤ 1 + 1 → legal
        shaped({ id: "s2", veilId: "v2", slot: "neck", essenceInvested: 3, capacityBonus: 1 }), // ≤ 1 + 1 + 1
      ],
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.essence.capacityCap).toBe(1); // the base band is NOT inflated
    expect(ak.classes[0]!.capacityBonus).toBe(1);
    expect(ak.shaped[0]!.effectiveCap).toBe(2);
    expect(ak.shaped[0]!.overCapacity).toBe(false);
    expect(ak.shaped[1]!.effectiveCap).toBe(3);
    expect(ak.shaped[1]!.overCapacity).toBe(false);
    expect(ak.warnings).toEqual([]);
  });

  it("investing past the RAISED cap still warns with the effective cap (never blocked)", () => {
    const c = base(3);
    c.akashic = {
      ...emptyBlock(),
      classes: [akClass({ id: "vz", className: "Vizier", classLevel: 3, essenceMax: 5, capacityBonus: 1 })],
      veilsKnown: [veil({ id: "v1", name: "Crown of the Victor" })],
      shaped: [shaped({ id: "s1", veilId: "v1", slot: "head", essenceInvested: 3 })],
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.shaped[0]!.overCapacity).toBe(true);
    expect(ak.warnings.some((w) => w.includes("capacity cap (2)"))).toBe(true);
  });
});

describe("akashic — per-veil save DCs", () => {
  it("default DC = 10 + essence invested + the ATTRIBUTED class's veilweaving mod, with terms", () => {
    const c = base(9);
    c.abilities.primary.int.score = 18; // +4 — Vizier keys off Int
    c.abilities.primary.wis.score = 12; // +1 — Guru keys off Wis
    c.akashic = {
      ...emptyBlock(),
      classes: [
        akClass({ id: "vz", className: "Vizier", classLevel: 7, veilweavingAbility: "int", essenceMax: 7 }),
        akClass({ id: "gu", className: "Guru", classLevel: 2, veilweavingAbility: "wis", essenceMax: 2 }),
      ],
      veilsKnown: [veil({ id: "v1", name: "Gorget of the Wyrm" }), veil({ id: "v2", name: "Horselord's Greaves" })],
      shaped: [
        shaped({ id: "s1", veilId: "v1", classId: "vz", slot: "neck", essenceInvested: 2 }),
        shaped({ id: "s2", veilId: "v2", classId: "gu", slot: "feet", essenceInvested: 2 }),
        shaped({ id: "s3", veilId: "v1", slot: "chest", essenceInvested: 1 }), // unattributed → first class
      ],
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.classes.map((cl) => cl.veilweavingMod)).toEqual([4, 1]);
    expect(ak.shaped[0]!.dc.value).toBe(16); // 10 + 2 + 4
    expect(ak.shaped[1]!.dc.value).toBe(13); // 10 + 2 + 1 — same investment, other class's ability
    expect(ak.shaped[2]!.dc.value).toBe(15); // 10 + 1 + 4 (falls back to the first class)
    expect(ak.shaped[0]!.dc.terms).toEqual([
      { ref: "essenceInvested", value: 2 },
      { ref: "veilweavingMod", value: 4 },
    ]);
  });

  it("honors a custom saveDcFormula referencing @{essenceInvested}", () => {
    const c = base(12);
    c.akashic = {
      ...emptyBlock(),
      classes: [akClass({ id: "a1", className: "Daevic", classLevel: 12, essenceMax: 12 })],
      veilsKnown: [veil({ id: "v1", name: "Bloodpelt Hunter's Cloak" })],
      shaped: [shaped({ id: "s1", veilId: "v1", slot: "shoulders", essenceInvested: 3, saveDcFormula: "12 + @{essenceInvested} * 2" })],
    };
    expect(computeCharacter(c).summary.akashic!.shaped[0]!.dc.value).toBe(18);
  });

  it("no classes → DC = 10 + invested", () => {
    const c = base(4);
    c.akashic = {
      ...emptyBlock(),
      veilsKnown: [veil({ id: "v1", name: "Lash of the Crumbling Grave" })],
      shaped: [shaped({ id: "s1", veilId: "v1", slot: "wrists", essenceInvested: 1 })],
    };
    expect(computeCharacter(c).summary.akashic!.shaped[0]!.dc.value).toBe(11);
  });
});

describe("akashic — bind validity + slot collisions", () => {
  it("a bind is valid only in a chakra the attributed class unlocked (case-insensitive); never blocks", () => {
    const c = base(6);
    c.akashic = {
      ...emptyBlock(),
      classes: [akClass({ id: "a1", className: "Vizier", classLevel: 6, essenceMax: 6, unlockedBinds: ["hands", "feet"] })],
      veilsKnown: [veil({ id: "v1", name: "Armory of the Conqueror" }), veil({ id: "v2", name: "Crown of the Victor" })],
      shaped: [
        shaped({ id: "s1", veilId: "v1", slot: "Hands", bound: true }),
        shaped({ id: "s2", veilId: "v2", slot: "head", bound: true }),
      ],
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.shaped[0]!.bindValid).toBe(true);
    expect(ak.shaped[1]!.bindValid).toBe(false);
    expect(ak.warnings.some((w) => w.includes("Crown of the Victor") && w.includes("chakra bind"))).toBe(true);
  });

  // The prod progressions say "Chakra bind (Belts)" (Vizier/Promethean/Sphereshaper L16) while
  // every belt veil's slot is singular "Belt" — the comparison strips a trailing "s" from BOTH
  // sides (stored data untouched), so plural unlocks match singular slots and inherently-plural
  // slots ("hands") keep matching themselves.
  it("bind matching tolerates singular/plural drift (belts↔Belt, hands↔Hands) without over-matching", () => {
    const c = base(16);
    c.akashic = {
      ...emptyBlock(),
      classes: [
        akClass({ id: "vz", className: "Vizier", classLevel: 16, essenceMax: 22, unlockedBinds: ["hands", "belts"] }),
      ],
      veilsKnown: [
        veil({ id: "v1", name: "Girdle of Mighty Prowess" }),
        veil({ id: "v2", name: "Armory of the Conqueror" }),
        veil({ id: "v3", name: "Crown of the Victor" }),
      ],
      shaped: [
        shaped({ id: "s1", veilId: "v1", slot: "Belt", bound: true }), // "belts" unlock ↔ "Belt" slot
        shaped({ id: "s2", veilId: "v2", slot: "Hands", bound: true }), // plural slot self-matches
        shaped({ id: "s3", veilId: "v3", slot: "head", bound: true }), // stripping never over-matches
      ],
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.shaped[0]!.bindValid).toBe(true);
    expect(ak.shaped[1]!.bindValid).toBe(true);
    expect(ak.shaped[2]!.bindValid).toBe(false);
    expect(ak.warnings).toEqual([expect.stringContaining("Crown of the Victor")]);
  });

  it("an UNBOUND veil in a non-unlocked slot is fine (it just occupies the slot)", () => {
    const c = base(3);
    c.akashic = {
      ...emptyBlock(),
      classes: [akClass({ id: "a1", className: "Guru", classLevel: 3, essenceMax: 3, unlockedBinds: ["hands"] })],
      veilsKnown: [veil({ id: "v1", name: "Seven League Boots" })],
      shaped: [shaped({ id: "s1", veilId: "v1", slot: "feet" })],
    };
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.shaped[0]!.bindValid).toBe(true);
    expect(ak.warnings).toEqual([]);
  });

  it("two ENABLED veils in the same normalized slot collide; a disabled one does not", () => {
    const withSecondEnabled = (enabled: boolean) => {
      const c = base(8);
      c.akashic = {
        ...emptyBlock(),
        classes: [akClass({ id: "a1", className: "Vizier", classLevel: 8, essenceMax: 8 })],
        veilsKnown: [veil({ id: "v1", name: "Mantle of Flame" }), veil({ id: "v2", name: "Mantle of Frost" })],
        shaped: [
          shaped({ id: "s1", veilId: "v1", slot: "Shoulders" }),
          shaped({ id: "s2", veilId: "v2", slot: "shoulders", enabled }),
        ],
      };
      return computeCharacter(c).summary.akashic!;
    };
    const collided = withSecondEnabled(true);
    expect(collided.warnings.some((w) => w.includes("slot collision") && w.includes("shoulders"))).toBe(true);
    expect(withSecondEnabled(false).warnings).toEqual([]);
  });
});

describe("akashic — shaped-veil automation feeds the modifier buckets", () => {
  const withVeil = (essenceInvested: number, enabled = true) => (c: ReturnType<typeof createDefaultCharacter>) => {
    c.akashic = {
      ...emptyBlock(),
      classes: [akClass({ id: "a1", className: "Daevic", classLevel: c.identity.totalLevel, essenceMax: 12 })],
      veilsKnown: [veil({ id: "v1", name: "Twisting Vines" })],
      shaped: [
        shaped({
          id: "s1",
          veilId: "v1",
          slot: "body",
          essenceInvested,
          enabled,
          automation: [{ id: "e1", target: "ac", operation: "add", value: "1 + @{essenceInvested}", bonusType: "natural_armor" }],
        }),
      ],
    };
  };
  const acOf = (mutate?: (c: ReturnType<typeof createDefaultCharacter>) => void) => {
    const c = base(12);
    mutate?.(c);
    return computeCharacter(c).armorClass.total.value;
  };

  it("an essence-scaling natural-armor veil reaches AC and CHANGES with the investment", () => {
    const baseline = acOf();
    expect(acOf(withVeil(3))).toBe(baseline + 4); // 1 + 3 essence
    expect(acOf(withVeil(1))).toBe(baseline + 2); // reallocating essence changes the bonus
    expect(acOf(withVeil(0))).toBe(baseline + 1);
  });

  it("a DISABLED shaped veil is inert", () => {
    expect(acOf(withVeil(3, false))).toBe(acOf());
  });

  it("registers @{akashic.essence.*} resolver paths for cross-formula use (module-gated)", () => {
    const c = base(12);
    withVeil(3)(c);
    c.feats.list.push({
      id: "f1",
      name: "Essence Focus",
      tags: [],
      automation: [{ id: "fe1", target: "init", operation: "add", value: "@{akashic.essence.available}" }],
    });
    const baselineInit = computeCharacter(base(12)).summary.initiative;
    // total 12, invested 3 → available 9.
    expect(computeCharacter(c).summary.initiative).toBe(baselineInit + 9);
  });
});

describe("akashic — module gating", () => {
  it("module off → no summary and the veil automation is inert", () => {
    const c = createDefaultCharacter({ name: "Veilweaver" });
    c.identity.totalLevel = 12;
    const baseline = computeCharacter(c).armorClass.total.value;
    c.akashic = {
      ...emptyBlock(),
      veilsKnown: [veil({ id: "v1", name: "Twisting Vines" })],
      shaped: [
        shaped({
          id: "s1",
          veilId: "v1",
          slot: "body",
          essenceInvested: 3,
          automation: [{ id: "e1", target: "ac", operation: "add", value: "1 + @{essenceInvested}", bonusType: "natural_armor" }],
        }),
      ],
    };
    const computed = computeCharacter(c);
    expect(computed.summary.akashic).toBeUndefined();
    expect(computed.armorClass.total.value).toBe(baseline);
  });

  it("absent when the module is enabled but no block exists", () => {
    expect(computeCharacter(base(5)).summary.akashic).toBeUndefined();
  });

  it("an empty block computes clean zeros", () => {
    const c = base(7);
    c.akashic = emptyBlock();
    const ak = computeCharacter(c).summary.akashic!;
    expect(ak.essence).toEqual({ total: 0, invested: 0, available: 0, temporary: 0, capacityCap: 2 });
    expect(ak.classes).toEqual([]);
    expect(ak.shaped).toEqual([]);
    expect(ak.veilsKnownCount).toBe(0);
    expect(ak.warnings).toEqual([]);
  });
});
