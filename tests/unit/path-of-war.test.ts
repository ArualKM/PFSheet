import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  powInitiationAbility,
  POW_INITIATION_DEFAULTS,
  type PowInitiator,
  type PowManeuver,
} from "@pathforge/schema";
import {
  computeCharacter,
  deriveInitiatorLevel,
  highestInitiatorLevel,
  highestManeuverLevelForIL,
} from "@pathforge/rules-pf1e";

const initiator = (over: Partial<PowInitiator> & { id: string }): PowInitiator => ({
  className: "",
  classLevel: 0,
  initiationAbility: "",
  recoveryMethod: "standard_action",
  disciplineKeys: [],
  ...over,
});

const maneuver = (over: Partial<PowManeuver> & { id: string; name: string }): PowManeuver => ({
  level: 1,
  entryKind: "maneuver",
  readied: false,
  expended: false,
  granted: false,
  stanceActive: false,
  automation: [],
  ...over,
});

function base(level = 7) {
  const c = createDefaultCharacter({ name: "Initiator" });
  c.rules.modules.push({ key: "path_of_war", enabled: true, settings: {} });
  c.identity.totalLevel = level;
  return c;
}

describe("path of war — initiator level (the four S4 cases)", () => {
  it("single-class: Stalker 7 at character level 7 → IL 7", () => {
    const c = base(7);
    c.pathOfWar = { initiators: [initiator({ id: "i1", className: "Stalker", classLevel: 7 })], maneuvers: [] };
    const pow = computeCharacter(c).summary.pathOfWar!;
    expect(pow.initiators[0]!.initiatorLevel).toBe(7);
    expect(pow.initiators[0]!.maxManeuverLevel).toBe(4);
    expect(pow.highestManeuverLevel).toBe(4);
  });

  it("multiclass: Stalker 5 in a level-9 character → 5 + ⌊4/2⌋ = 7", () => {
    const c = base(9);
    c.pathOfWar = { initiators: [initiator({ id: "i1", className: "Stalker", classLevel: 5 })], maneuvers: [] };
    expect(computeCharacter(c).summary.pathOfWar!.initiators[0]!.initiatorLevel).toBe(7);
  });

  it("no PoW classes but maneuvers known (feat access): IL = ⌊charLevel/2⌋ — level 8 → 4", () => {
    const c = base(8);
    c.pathOfWar = { initiators: [], maneuvers: [maneuver({ id: "m1", name: "Steel Strike" })] };
    const pow = computeCharacter(c).summary.pathOfWar!;
    expect(pow.initiators).toHaveLength(1); // the derived pseudo-initiator row
    expect(pow.initiators[0]!.id).toBe("pow-derived");
    expect(pow.initiators[0]!.initiatorLevel).toBe(4);
    expect(pow.highestManeuverLevel).toBe(2);
  });

  it("derived IL is capped at character level (classLevel above total level clamps)", () => {
    expect(deriveInitiatorLevel(10, 6)).toBe(6);
    const c = base(6);
    c.pathOfWar = { initiators: [initiator({ id: "i1", className: "Warder", classLevel: 10 })], maneuvers: [] };
    expect(computeCharacter(c).summary.pathOfWar!.initiators[0]!.initiatorLevel).toBe(6);
  });

  it("initiatorLevelFormula overrides the derivation", () => {
    const c = base(6);
    c.pathOfWar = {
      initiators: [
        initiator({ id: "i1", className: "Warder", classLevel: 6 }),
        initiator({ id: "i2", className: "Warder", classLevel: 6, initiatorLevelFormula: "@{level.total} + 2" }),
      ],
      maneuvers: [],
    };
    const pow = computeCharacter(c).summary.pathOfWar!;
    expect(pow.initiators[0]!.initiatorLevel).toBe(6); // derived: 6 + ⌊0/2⌋, capped at 6
    expect(pow.initiators[1]!.initiatorLevel).toBe(8); // explicit override wins outright
    expect(pow.initiators[1]!.maxManeuverLevel).toBe(4);
  });
});

describe("path of war — IL → highest maneuver level table", () => {
  it("matches the published boundaries (1-2→1, 3-4→2, … 15-16→8, 17+→9)", () => {
    expect(highestManeuverLevelForIL(0)).toBe(0);
    expect(highestManeuverLevelForIL(1)).toBe(1);
    expect(highestManeuverLevelForIL(2)).toBe(1);
    expect(highestManeuverLevelForIL(3)).toBe(2);
    expect(highestManeuverLevelForIL(4)).toBe(2);
    expect(highestManeuverLevelForIL(9)).toBe(5);
    expect(highestManeuverLevelForIL(16)).toBe(8);
    expect(highestManeuverLevelForIL(17)).toBe(9);
    expect(highestManeuverLevelForIL(20)).toBe(9);
  });
});

describe("path of war — initiation ability + save DCs", () => {
  it("initiation ability defaults per class; an explicit key wins", () => {
    expect(POW_INITIATION_DEFAULTS.warlord).toBe("cha");
    expect(POW_INITIATION_DEFAULTS.zealot).toBe("cha");
    expect(powInitiationAbility({ className: "Warlord", initiationAbility: "" })).toBe("cha");
    expect(powInitiationAbility({ className: "harbinger", initiationAbility: "" })).toBe("int");
    expect(powInitiationAbility({ className: "Homebrew", initiationAbility: "" })).toBe("wis");
    expect(powInitiationAbility({ className: "Warlord", initiationAbility: "str" })).toBe("str");
  });

  it("DC = 10 + maneuver level + initiation mod; @{maneuverLevel} is the MANEUVER's level, never IL", () => {
    const c = base(9);
    c.abilities.primary.wis.score = 18; // +4 — Stalker keys off Wis by default
    c.pathOfWar = {
      initiators: [initiator({ id: "i1", className: "Stalker", classLevel: 9 })], // IL 9
      maneuvers: [
        maneuver({ id: "m1", name: "Low Strike", level: 1, initiatorId: "i1" }),
        maneuver({ id: "m5", name: "High Strike", level: 5, initiatorId: "i1" }),
      ],
    };
    const pow = computeCharacter(c).summary.pathOfWar!;
    expect(pow.initiators[0]!.initiationMod).toBe(4);
    expect(pow.maneuverDcs.m5).toBe(19); // 10 + 5 + 4
    expect(pow.maneuverDcs.m1).toBe(15); // 10 + 1 + 4 — NOT 10 + IL(9) + 4
    expect(pow.initiators[0]!.dcByManeuverLevel).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });

  it("honors a custom saveDcFormula referencing @{maneuverLevel}", () => {
    const c = base(7);
    c.pathOfWar = {
      initiators: [initiator({ id: "i1", className: "Warlord", classLevel: 7 })],
      maneuvers: [
        maneuver({ id: "mc", name: "Cursed Blow", level: 3, initiatorId: "i1", saveDcFormula: "15 + @{maneuverLevel}" }),
      ],
    };
    expect(computeCharacter(c).summary.pathOfWar!.maneuverDcs.mc).toBe(18);
  });

  it("favoredWeaponBonus adds the S4 +2 competence to that maneuver's DC — default and custom formulas", () => {
    const c = base(9);
    c.abilities.primary.wis.score = 18; // +4 — Stalker keys off Wis
    c.pathOfWar = {
      initiators: [initiator({ id: "i1", className: "Stalker", classLevel: 9 })],
      maneuvers: [
        maneuver({ id: "plain", name: "Plain Strike", level: 1, initiatorId: "i1" }),
        maneuver({ id: "fav", name: "Favored Strike", level: 1, initiatorId: "i1", favoredWeaponBonus: true }),
        maneuver({
          id: "favCustom",
          name: "Favored Custom",
          level: 3,
          initiatorId: "i1",
          saveDcFormula: "15 + @{maneuverLevel}",
          favoredWeaponBonus: true,
        }),
      ],
    };
    const pow = computeCharacter(c).summary.pathOfWar!;
    expect(pow.maneuverDcs.plain).toBe(15); // 10 + 1 + 4 — the toggle is off by default
    expect(pow.maneuverDcs.fav).toBe(17); // +2 on the default formula
    expect(pow.maneuverDcs.favCustom).toBe(20); // +2 on TOP of a custom formula (never rewrites it)
    // The per-initiator default DC table never includes the per-maneuver toggle.
    expect(pow.initiators[0]!.dcByManeuverLevel[0]).toBe(15);
  });
});

describe("path of war — @{initiatorLevel} in stance automation", () => {
  it("a scaling stance formula floor(@{initiatorLevel}/4) reaches the AC bucket (not silent 0)", () => {
    const acOf = (mutate?: (c: ReturnType<typeof createDefaultCharacter>) => void) => {
      const c = base(16);
      mutate?.(c);
      return computeCharacter(c).armorClass.total.value;
    };
    const withScalingStance = (ref: string, classLevel: number) => (c: ReturnType<typeof createDefaultCharacter>) => {
      c.pathOfWar = {
        initiators: [initiator({ id: "i1", className: "Warder", classLevel })],
        maneuvers: [
          maneuver({
            id: "s1",
            name: "Silver Crane Waltz",
            entryKind: "stance",
            stanceActive: true,
            automation: [{ id: "e1", target: "ac", operation: "add", value: `floor(${ref}/4)`, bonusType: "sacred" }],
          }),
        ],
      };
    };
    const baseline = acOf();
    // Single-class Warder 16 → IL 16 → +4.
    expect(acOf(withScalingStance("@{initiatorLevel}", 16))).toBe(baseline + 4);
    // The namespaced alias resolves identically.
    expect(acOf(withScalingStance("@{pathOfWar.initiatorLevel}", 16))).toBe(baseline + 4);
    // Multiclass: Warder 12 in a level-16 character → IL 12 + ⌊4/2⌋ = 14 → +3 (NOT ⌊16/4⌋ = 4,
    // the wrong value @{level.total} would give).
    expect(acOf(withScalingStance("@{initiatorLevel}", 12))).toBe(baseline + 3);
  });

  it("highestInitiatorLevel: max across initiators; feat-access ½-level fallback; 0 without a block", () => {
    const c = base(10);
    expect(highestInitiatorLevel(c)).toBe(0);
    c.pathOfWar = { initiators: [], maneuvers: [maneuver({ id: "m1", name: "Strike" })] };
    expect(highestInitiatorLevel(c)).toBe(5);
    c.pathOfWar.initiators.push(
      initiator({ id: "i1", className: "Warlord", classLevel: 4 }), // IL 4 + ⌊6/2⌋ = 7
      initiator({ id: "i2", className: "Stalker", classLevel: 9 }), // IL 9 + ⌊1/2⌋ = 9
    );
    expect(highestInitiatorLevel(c)).toBe(9);
  });
});

describe("path of war — counts + lifecycle", () => {
  it("counts known/stances/readied/granted/expended, names active stances, echoes maxes", () => {
    const c = base(7);
    c.pathOfWar = {
      initiators: [
        initiator({
          id: "i1",
          className: "Warlord",
          classLevel: 7,
          maneuversKnownMax: 9,
          maneuversReadiedMax: 6,
          maneuversGrantedMax: 4,
          stancesKnownMax: 3,
        }),
      ],
      maneuvers: [
        maneuver({ id: "m1", name: "A", readied: true }),
        maneuver({ id: "m2", name: "B", readied: true, expended: true }),
        maneuver({ id: "m3", name: "C", granted: true }),
        maneuver({ id: "st1", name: "Stance One", entryKind: "stance", stanceActive: true }),
        maneuver({ id: "st2", name: "Stance Two", entryKind: "stance" }),
      ],
    };
    const pow = computeCharacter(c).summary.pathOfWar!;
    expect(pow.maneuversKnown).toBe(3);
    expect(pow.stancesKnown).toBe(2);
    expect(pow.readied).toBe(2);
    expect(pow.granted).toBe(1);
    expect(pow.expended).toBe(1);
    expect(pow.activeStanceNames).toEqual(["Stance One"]);
    expect(pow.initiators[0]).toMatchObject({
      maneuversKnownMax: 9,
      maneuversReadiedMax: 6,
      maneuversGrantedMax: 4,
      stancesKnownMax: 3,
    });
  });

  it("readiedCount is PER-INITIATOR (initiatorId attribution, else the first initiator)", () => {
    const c = base(10);
    c.pathOfWar = {
      initiators: [
        initiator({ id: "i1", className: "Warlord", classLevel: 10, maneuversReadiedMax: 4 }),
        initiator({ id: "i2", className: "Homebrew", classLevel: 10 }), // capless second initiator
      ],
      maneuvers: [
        maneuver({ id: "m1", name: "A", initiatorId: "i1", readied: true }),
        maneuver({ id: "m2", name: "B", initiatorId: "i1", readied: true }),
        maneuver({ id: "m3", name: "C", initiatorId: "i2", readied: true }),
        maneuver({ id: "m4", name: "D", readied: true }), // unattributed → first initiator
        maneuver({ id: "m5", name: "E", initiatorId: "i2" }), // not readied
      ],
    };
    const pow = computeCharacter(c).summary.pathOfWar!;
    expect(pow.readied).toBe(4); // the global total is unchanged
    expect(pow.initiators.map((i) => i.readiedCount)).toEqual([3, 1]);
  });
});

describe("path of war — active stances feed the modifier buckets", () => {
  const withEntry =
    (entryKind: "maneuver" | "stance", stanceActive: boolean) =>
    (c: ReturnType<typeof createDefaultCharacter>) => {
      c.pathOfWar = {
        initiators: [initiator({ id: "i1", className: "Warder", classLevel: 5 })],
        maneuvers: [
          maneuver({
            id: "s1",
            name: "Tortoise Shell",
            entryKind,
            stanceActive,
            readied: entryKind === "maneuver",
            automation: [{ id: "e1", target: "ac", operation: "add", value: 2, bonusType: "dodge" }],
          }),
        ],
      };
    };
  const acOf = (mutate?: (c: ReturnType<typeof createDefaultCharacter>) => void) => {
    const c = base(5);
    mutate?.(c);
    return computeCharacter(c).armorClass.total.value;
  };

  it("an ACTIVE stance's +2 dodge reaches AC; an inactive stance and a non-stance maneuver do not", () => {
    const baseline = acOf();
    expect(acOf(withEntry("stance", true))).toBe(baseline + 2);
    expect(acOf(withEntry("stance", false))).toBe(baseline);
    // A strike/boost is spendable — its automation must never auto-apply, even with a stray flag.
    expect(acOf(withEntry("maneuver", true))).toBe(baseline);
  });

  it("module off → stance automation is inert and no summary is emitted", () => {
    const c = createDefaultCharacter({ name: "Initiator" });
    c.identity.totalLevel = 5;
    const baseline = computeCharacter(c).armorClass.total.value;
    withEntry("stance", true)(c);
    const computed = computeCharacter(c);
    expect(computed.summary.pathOfWar).toBeUndefined();
    expect(computed.armorClass.total.value).toBe(baseline);
  });

  it("absent when the module is enabled but no block exists", () => {
    expect(computeCharacter(base(5)).summary.pathOfWar).toBeUndefined();
  });
});
