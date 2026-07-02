import { describe, it, expect } from "vitest";
import type { PowManeuver } from "@pathforge/schema";
import {
  readPowProgressionMaxes,
  powRecoveryDefault,
  setActiveStance,
  parseManeuverLevel,
  groupManeuversByDiscipline,
} from "@/lib/character/path-of-war-presets";

/**
 * 3PP Phase 4 — the Path of War editor's pure helpers. The progression fixtures MIRROR THE REAL
 * prod `threepp_class_compendium` rows (verified by query): the Stalker's header carries a
 * "Dodge Bonus" column and a BARE "Stances" column (only Harbinger/Mystic/Zealot use "Stances
 * Known"); the Mystic's readied cells carry the granted draw in parentheses ("5 (2)"); the
 * prestige tables (Mage Hunter et al.) use bare "Known"/"Readied"/"Stances" headers whose cells
 * are per-level GAINS, not cumulative totals.
 */

// Real prod stalker-path-of-war rows (levels 1–3 + 20): "Dodge Bonus" before the maneuver block,
// bare "Stances" header.
const STALKER_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Dodge Bonus", "Maneuvers Known", "Maneuvers Readied", "Stances"],
  ["1st", "+0", "+0", "+0", "+2", "Ki pool, deadly strike +1d6, stalker art", "+0", "6", "4", "1"],
  ["2nd", "+1", "+0", "+0", "+3", "Combat insight (defensive reflexes)", "+1", "7", "4", "2"],
  ["3rd", "+2", "+1", "+1", "+3", "Stalker art", "+1", "8", "5", "2"],
  ["20th", "+15/+10/+5", "+6", "+6", "+12", "Retributive ki", "+5", "21", "12", "7"],
];

// Real prod mystic-path-of-war rows: "Stances Known" header, readied cells annotated with the
// round-start GRANTED draw ("5 (2)").
const MYSTIC_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Maneuvers Known", "Maneuvers Readied", "Stances Known"],
  ["1st", "+0", "+0", "+0", "+2", "Animus, blade meditation, elemental attunement", "7", "5 (2)", "1"],
  ["3rd", "+2", "+1", "+1", "+3", "Elemental glyph (I)", "9", "6 (3)", "2"],
  ["9th", "+6/+1", "+3", "+3", "+6", "Quell magic", "15", "8 (5)", "4"],
  ["20th", "+15/+10/+5", "+6", "+6", "+12", "Glyph mastery, arcane defense +5", "21", "12 (9)", "7"],
];

// Real prod mage-hunter-path-of-war (complete): a PRESTIGE table — bare "Known"/"Readied"/
// "Stances" headers, cells are per-level GAINS ("0"/"1"), so the max at level N is the SUM.
const MAGE_HUNTER_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Known", "Readied", "Stances"],
  ["1st", "+0", "+0", "+1", "+0", "Martial arcanist (disruptive), arcane tenacity", "0", "0", "0"],
  ["2nd", "+1", "+1", "+1", "+1", "Anchoring point", "1", "0", "0"],
  ["3rd", "+2", "+1", "+2", "+1", "Strike of dispelling", "0", "1", "0"],
  ["4th", "+3", "+1", "+2", "+1", "Arcane endurance", "1", "0", "1"],
  ["5th", "+3", "+2", "+3", "+2", "Stance of the mage killer", "0", "0", "0"],
  ["6th", "+4", "+2", "+3", "+2", "Mage hunter concentration", "1", "1", "1"],
  ["7th", "+5", "+2", "+4", "+2", "Tethering point", "0", "0", "0"],
  ["8th", "+6/+1", "+3", "+4", "+3", "Martial arcanist (spellbreaker)", "1", "0", "0"],
  ["9th", "+6/+1", "+3", "+5", "+3", "Strike of magic rending", "0", "1", "0"],
  ["10th", "+7/+2", "+3", "+5", "+3", "Mage harrier’s stance", "1", "0", "1"],
];

// Synthetic: dash/annotation cell semantics (real base-class rows are all plain ints).
const DASH_PROG = [
  ["Level", "Base Attack Bonus", "Special", "Maneuvers Known", "Maneuvers Readied", "Stances Known"],
  ["1st", "+0", "Stalker arts¹", "7¹", "4", "—"],
];

/** The Miraheze scraper's object format (73/129 prod rows) — normalizeProgression converts it. */
const OBJECT_PROG = [
  {
    Level: "1",
    "Base Attack Bonus": "+0",
    "Fort Save": "+2",
    "Ref Save": "+0",
    "Will Save": "+2",
    Special: "Maneuvers, defensive focus",
    "Maneuvers Known": "9",
    "Maneuvers Readied": "5",
    "Stances Known": "2",
  },
  {
    Level: "2",
    "Base Attack Bonus": "+1",
    "Fort Save": "+3",
    "Ref Save": "+0",
    "Will Save": "+3",
    Special: "—",
    "Maneuvers Known": "10",
    "Maneuvers Readied": "5",
    "Stances Known": "2",
  },
];

describe("readPowProgressionMaxes", () => {
  it("reads the maxes from the REAL Stalker shape — bare 'Stances' header + a Dodge Bonus column", () => {
    expect(readPowProgressionMaxes(STALKER_PROG, 1)).toEqual({ known: 6, readied: 4, stances: 1 });
    expect(readPowProgressionMaxes(STALKER_PROG, 3)).toEqual({ known: 8, readied: 5, stances: 2 });
    // The stances value comes from the "Stances" column, never the adjacent "Dodge Bonus" (+5).
    expect(readPowProgressionMaxes(STALKER_PROG, 20)).toEqual({ known: 21, readied: 12, stances: 7 });
  });

  it("Mystic 'N (M)' readied cells: leading int = readied max, parenthetical = GRANTED max", () => {
    expect(readPowProgressionMaxes(MYSTIC_PROG, 1)).toEqual({ known: 7, readied: 5, granted: 2, stances: 1 });
    expect(readPowProgressionMaxes(MYSTIC_PROG, 9)).toEqual({ known: 15, readied: 8, granted: 5, stances: 4 });
    expect(readPowProgressionMaxes(MYSTIC_PROG, 20)).toEqual({ known: 21, readied: 12, granted: 9, stances: 7 });
  });

  it("prestige tables (bare Known/Readied/Stances headers) sum their per-level GAINS", () => {
    expect(readPowProgressionMaxes(MAGE_HUNTER_PROG, 1)).toEqual({ known: 0, readied: 0, stances: 0 });
    expect(readPowProgressionMaxes(MAGE_HUNTER_PROG, 5)).toEqual({ known: 2, readied: 1, stances: 1 });
    expect(readPowProgressionMaxes(MAGE_HUNTER_PROG, 10)).toEqual({ known: 5, readied: 3, stances: 3 });
    // Above the table's top level, the full-table sum stands (the PrC is maxed out).
    expect(readPowProgressionMaxes(MAGE_HUNTER_PROG, 15)).toEqual({ known: 5, readied: 3, stances: 3 });
  });

  it("dash cells yield undefined for that field only; annotation markers are ignored", () => {
    expect(readPowProgressionMaxes(DASH_PROG, 1)).toEqual({ known: 7, readied: 4, stances: undefined });
  });

  it("a level a cumulative table doesn't cover yields {}", () => {
    expect(readPowProgressionMaxes(STALKER_PROG, 7)).toEqual({});
  });

  it("handles the Miraheze object format (plain-digit level cells) via normalizeProgression", () => {
    expect(readPowProgressionMaxes(OBJECT_PROG, 1)).toEqual({ known: 9, readied: 5, stances: 2 });
    expect(readPowProgressionMaxes(OBJECT_PROG, 2)).toEqual({ known: 10, readied: 5, stances: 2 });
  });

  it("non-PoW progressions (no Maneuvers Known column) and garbage yield {}", () => {
    const core = [
      ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special"],
      ["1st", "+1", "+2", "+0", "+0", "Bonus feat"],
    ];
    expect(readPowProgressionMaxes(core, 1)).toEqual({});
    expect(readPowProgressionMaxes(null, 1)).toEqual({});
    expect(readPowProgressionMaxes("nonsense", 1)).toEqual({});
    expect(readPowProgressionMaxes([], 1)).toEqual({});
  });
});

describe("powRecoveryDefault", () => {
  it("maps the classes with bespoke recovery; everything else is a standard action", () => {
    expect(powRecoveryDefault("Warlord")).toBe("warlord_gambit");
    expect(powRecoveryDefault("Warder")).toBe("warder_defensive_focus");
    expect(powRecoveryDefault("Stalker")).toBe("stalker_full_round");
    expect(powRecoveryDefault("Mystic")).toBe("standard_action");
    expect(powRecoveryDefault("Zealot")).toBe("standard_action");
    expect(powRecoveryDefault("Homebrew Adept")).toBe("standard_action");
  });

  it("archetype-suffixed names still hit their class (and Warder never matches Warlord)", () => {
    expect(powRecoveryDefault("Warder (Zweihänder Sentinel)")).toBe("warder_defensive_focus");
    expect(powRecoveryDefault("warlord (Vanguard Commander)")).toBe("warlord_gambit");
  });
});

describe("setActiveStance — one active stance per character", () => {
  const entry = (over: Partial<PowManeuver> & { id: string }): PowManeuver => ({
    name: over.id,
    level: 1,
    entryKind: "stance",
    readied: false,
    expended: false,
    granted: false,
    stanceActive: false,
    automation: [],
    ...over,
  });

  it("activating a stance deactivates every other entry", () => {
    const list = [entry({ id: "a", stanceActive: true }), entry({ id: "b" }), entry({ id: "c" })];
    setActiveStance(list, "b", true);
    expect(list.map((m) => m.stanceActive)).toEqual([false, true, false]);
  });

  it("deactivating clears only the target", () => {
    const list = [entry({ id: "a", stanceActive: true }), entry({ id: "b" })];
    setActiveStance(list, "a", false);
    expect(list.map((m) => m.stanceActive)).toEqual([false, false]);
  });

  it("a non-stance entry can never be flagged active (its automation would leak into totals)", () => {
    const list = [entry({ id: "a", stanceActive: true }), entry({ id: "m", entryKind: "maneuver" })];
    setActiveStance(list, "m", true);
    expect(list.find((m) => m.id === "m")!.stanceActive).toBe(false);
    // …but the activation attempt still cleared the previous stance (explicit user intent).
    expect(list.find((m) => m.id === "a")!.stanceActive).toBe(false);
  });
});

describe("parseManeuverLevel", () => {
  it("parses the compendium's text level, clamped 1–9", () => {
    expect(parseManeuverLevel("3")).toBe(3);
    expect(parseManeuverLevel(" 9 ")).toBe(9);
    expect(parseManeuverLevel("0")).toBe(1);
    expect(parseManeuverLevel("12")).toBe(9);
    expect(parseManeuverLevel("—")).toBeUndefined();
    expect(parseManeuverLevel(null)).toBeUndefined();
    expect(parseManeuverLevel(undefined)).toBeUndefined();
  });
});

describe("groupManeuversByDiscipline", () => {
  it("groups alphabetically with no-discipline entries under a trailing Other, sorted level→name", () => {
    const groups = groupManeuversByDiscipline([
      { name: "Zephyr", level: 2, discipline: "Solar Wind" },
      { name: "Aria", level: 1, discipline: "Solar Wind" },
      { name: "Bolt", level: 1, discipline: "Solar Wind" },
      { name: "Shard", level: 1, discipline: "Broken Blade" },
      { name: "Mystery", level: 4 },
      { name: "Blank", level: 2, discipline: "  " },
    ]);
    expect(groups.map((g) => g.discipline)).toEqual(["Broken Blade", "Solar Wind", "Other"]);
    expect(groups[1]!.maneuvers.map((m) => m.name)).toEqual(["Aria", "Bolt", "Zephyr"]);
    expect(groups[2]!.maneuvers.map((m) => m.name)).toEqual(["Blank", "Mystery"]);
  });
});
