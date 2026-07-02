import { describe, it, expect } from "vitest";
import { readAkashicProgressionMaxes, parseBindUnlocks, parseCapacityBonus } from "@/lib/character/akashic-presets";
import { classLevelFor } from "@/lib/character/path-of-war-presets";

/**
 * 3PP Phase 5 — the Akashic editor's pure helpers. The progression fixtures MIRROR THE REAL prod
 * `threepp_class_compendium` akashic rows (verified by query): the Helmsman's header-row array
 * carries cumulative "Veils" + "Essence" columns and "chakra bind (…)" features in Special; the
 * Vizier/Guru are the Miraheze OBJECT format (ordinal level cells, case-drifting bind text); the
 * Zodiac is essence-only (no Veils column); the Rajah's Level/BAB/saves/Special header tier was
 * LOST at scrape (its 6-cell header sits over 12-cell rows) and must degrade, never throw.
 */

// Real prod helmsman-akashic rows (levels 1-5 + 19-20).
const HELMSMAN_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Veils", "Essence"],
  ["1st", "+0", "+2", "+2", "+0", "Bonded mech, hypercharge, veiled vessel", "1", "1"],
  ["2nd", "+1", "+3", "+3", "+0", "Akashic armaments, chakra bind (hands)", "1", "2"],
  ["3rd", "+2", "+3", "+3", "+1", "Hypercharge, improved essence capacity +1", "2", "3"],
  ["4th", "+3", "+4", "+4", "+1", "Chakra bind (feet)", "2", "4"],
  ["5th", "+3", "+4", "+4", "+1", "Hypercharge, lifebound vessel", "3", "5"],
  ["19th", "+14/+9/+4", "+11", "+11", "+6", "Hypercharge, push the limits 4", "10", "19"],
  ["20th", "+15/+10/+5", "+12", "+12", "+6", "Chakra bind (body), peerless strategist", "10", "20"],
];

// Real prod vizier-akashic rows (Miraheze object format; note the capitalized "Chakra bind (Hands)",
// the L9 gerund "ring binding", the L16 PLURAL "Chakra bind (Belts)", and the L3/11/19
// "Improved essence capacity +N" features — all verified cell-for-cell against prod).
const VIZIER_PROG = [
  { Level: "1st", "Base Attack Bonus": "+0", "Fort Save": "+2", "Ref Save": "+0", "Will Save": "+2", Special: "Eldritch insight, mystic attunement", Veils: "2", Essence: "1" },
  { Level: "2nd", "Base Attack Bonus": "+1", "Fort Save": "+3", "Ref Save": "+0", "Will Save": "+3", Special: "Chakra bind (Hands)", Veils: "3", Essence: "2" },
  { Level: "3rd", "Base Attack Bonus": "+1", "Fort Save": "+3", "Ref Save": "+1", "Will Save": "+3", Special: "Improved essence capacity +1, veilshifting", Veils: "3", Essence: "3" },
  { Level: "4th", "Base Attack Bonus": "+2", "Fort Save": "+4", "Ref Save": "+1", "Will Save": "+4", Special: "Chakra bind (Feet)", Veils: "4", Essence: "4" },
  { Level: "6th", "Base Attack Bonus": "+3", "Fort Save": "+5", "Ref Save": "+2", "Will Save": "+5", Special: "Chakra bind (Head)", Veils: "4", Essence: "6" },
  { Level: "8th", "Base Attack Bonus": "+4", "Fort Save": "+6", "Ref Save": "+2", "Will Save": "+6", Special: "Chakra bind (Wrists)", Veils: "5", Essence: "8" },
  { Level: "9th", "Base Attack Bonus": "+4", "Fort Save": "+6", "Ref Save": "+3", "Will Save": "+6", Special: "Mystic attunement, ring binding", Veils: "5", Essence: "9" },
  { Level: "11th", "Base Attack Bonus": "+5", "Fort Save": "+7", "Ref Save": "+3", "Will Save": "+7", Special: "Improved essence capacity +2, veilshifting", Veils: "6", Essence: "12" },
  { Level: "16th", "Base Attack Bonus": "+8/+3", "Fort Save": "+10", "Ref Save": "+5", "Will Save": "+10", Special: "Chakra bind (Belts)", Veils: "9", Essence: "22" },
  { Level: "19th", "Base Attack Bonus": "+9/+4", "Fort Save": "+11", "Ref Save": "+6", "Will Save": "+11", Special: "Improved essence capacity +3, veilshifting", Veils: "10", Essence: "28" },
  { Level: "20th", "Base Attack Bonus": "+10/+5", "Fort Save": "+12", "Ref Save": "+6", "Will Save": "+12", Special: "Chakra bind (Body), chakra rebirth", Veils: "11", Essence: "30" },
];

// Real prod guru-akashic rows — L3's "Chakra disruption (hands)" must NOT parse as a bind.
const GURU_PROG = [
  { Level: "1st", "Base Attack Bonus": "+0", "Fort Save": "+0", "Ref Save": "+2", "Will Save": "+2", Special: "Gentle touch, philosophy, stunning fist", Veils: "1", Essence: "1" },
  { Level: "2nd", "Base Attack Bonus": "+1", "Fort Save": "+0", "Ref Save": "+3", "Will Save": "+3", Special: "Sunder veil, chakra bind (hands)", Veils: "2", Essence: "2" },
  { Level: "3rd", "Base Attack Bonus": "+2", "Fort Save": "+1", "Ref Save": "+3", "Will Save": "+3", Special: "Chakra disruption (hands)", Veils: "2", Essence: "3" },
];

// Real prod zodiac-akashic rows — essence-only (no Veils column).
const ZODIAC_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Essence"],
  ["1st", "+0", "+2", "+0", "+2", "Constellations, orbit", "1"],
  ["3rd", "+2", "+3", "+1", "+3", "Improved essence capacity +1", "3"],
  ["20th", "+15/+10/+5", "+12", "+6", "+12", "Astrological mastery, orbit progression", "20"],
];

// Real prod rajah-akashic rows — the Level/BAB/saves/Special HEADER TIER WAS LOST at scrape (a
// known data quirk): a 6-cell header over 12-cell data rows. Must degrade to {} / [].
const RAJAH_PROG = [
  ["Known", "Readied", "Stances", "Veils", "Binds", "Essence"],
  ["1st", "+0", "+2", "+0", "+2", "Maneuvers, veilweaving, royal mandate, vassalage, the crossroads", "5", "3", "1", "2", "0", "1"],
  ["2nd", "+1", "+3", "+0", "+3", "House of servants", "6", "4", "2", "3", "0", "2"],
];

// Real prod amanuensis-akashic rows — the tier-PREFIX bind form with NO parens ("Low Chakra
// Bind"), the abbreviated parenthesized capacity ("Imp. Essence Capacity (+1)"), and "Binding
// Words" (which must never parse as a bind).
const AMANUENSIS_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Veils", "Essence"],
  ["1st", "+0", "+0", "+2", "+2", "Tools of the Scribe, Primal Words, Akashic Embellishment, Ruinous Calligraphy, Creatures of Myth", "1", "2"],
  ["3rd", "+2", "+1", "+3", "+3", "Imp. Essence Capacity (+1), Low Chakra Bind, Binding Words, Branding Strokes", "1", "4"],
  ["6th", "+4", "+2", "+5", "+5", "Ruinous Calligraphy, Low Chakra Bind", "2", "8"],
  ["9th", "+6/+1", "+3", "+6", "+6", "Branding Strokes, Imp. Essence Capacity (+2), Mystic Transcription, Middle Chakra Bind", "3", "11"],
  ["12th", "+9/+4", "+4", "+8", "+8", "Akashic Embellishment, Mystic Transcription, Middle Chakra Bind", "4", "15"],
  ["15th", "+11/+6/+1", "+5", "+9", "+9", "Branding Strokes, Imp. Essence Capacity (+3), Mystic Transcription, High Chakra Bind", "5", "19"],
  ["18th", "+13/+8/+3", "+6", "+11", "+11", "Ruinous Calligraphy, Pinnacle Chakra Bind", "6", "22"],
];

// Real prod pactbound-akashic rows — tier-prefix binds, SPLIT "base+bonus" Veils cells ("0+1"),
// the UNNUMBERED "Imp. Essence Cap." capacity steps (L3/9/15 — occurrences count), and "Bind
// Companion Spirit" (which must never parse as a bind).
const PACTBOUND_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Veils", "Essence"],
  ["1st", "+0", "+2", "+0", "+2", "Veilweaving, Minor Gifts, Pact, Eldritch Resonance, Planar Detonation 1d6, Planar Manipulations", "0+1", "2"],
  ["2nd", "+1", "+3", "+0", "+3", "Bind Companion Spirit, Low Chakra Bind, Planar Manipulations", "1+1", "3"],
  ["3rd", "+2", "+3", "+1", "+3", "Bonded Life, Planar Detonation 2d6, Imp. Essence Cap.", "1+1", "4"],
  ["5th", "+3", "+4", "+1", "+4", "Covenance, Low Chakra Bind, Planar Manipulations", "1+2", "7"],
  ["9th", "+6/+1", "+6", "+3", "+6", "Middle Chakra Bind, Planar Detonation 4d6, Imp. Essence Cap.", "2+3", "11"],
  ["13th", "+9/+4", "+8", "+4", "+8", "Middle Chakra Bind", "3+4", "16"],
  ["15th", "+11/+6/+1", "+9", "+5", "+9", "Covenance, Planar Detonation 6d6, Greater Suffusion, Imp. Essence Cap.", "4+4", "19"],
  ["16th", "+12/+7/+2", "+10", "+5", "+10", "High Chakra Bind", "4+4", "20"],
  ["19th", "+14/+9/+4", "+11", "+6", "+11", "Pinnacle Chakra Bind", "4+4", "23"],
];

// Real prod daevic-akashic rows (object format) — SPLIT Veils cells ("0+1" = base + passion
// veil), the slot-prefix "Blood bind" (L12), and "Improved Passion Capacity" (which is NOT an
// essence-capacity feature and must not parse as one).
const DAEVIC_PROG = [
  { Level: "1st", "Base Attack Bonus": "+1", "Fort Save": "+2", "Ref Save": "+2", "Will Save": "+0", Special: "Daevic veilweaving, passion skills", Veils: "0+1", Essence: "1" },
  { Level: "2nd", "Base Attack Bonus": "+2", "Fort Save": "+3", "Ref Save": "+3", "Will Save": "+0", Special: "Chakra bind (feet)", Veils: "1+1", Essence: "1" },
  { Level: "4th", "Base Attack Bonus": "+4", "Fort Save": "+4", "Ref Save": "+4", "Will Save": "+1", Special: "Chakra bind (hands)", Veils: "1+2", Essence: "2" },
  { Level: "9th", "Base Attack Bonus": "+9/+4", "Fort Save": "+6", "Ref Save": "+6", "Will Save": "+3", Special: "Improved Passion Capacity +1", Veils: "2+2", Essence: "4" },
  { Level: "12th", "Base Attack Bonus": "+12/+7/+2", "Fort Save": "+8", "Ref Save": "+8", "Will Save": "+4", Special: "Blood bind", Veils: "3+3", Essence: "6" },
  { Level: "13th", "Base Attack Bonus": "+13/+8/+3", "Fort Save": "+8", "Ref Save": "+8", "Will Save": "+4", Special: "Chakra bind (Belt)", Veils: "3+3", Essence: "6" },
];

// Real prod kheshig-akashic rows (object format) — split Veils cells plus the parenthesized TIER
// binds ("Chakra Bind (Low)") and numbered "Improved Essence Capacity +N".
const KHESHIG_PROG = [
  { Level: "1st", "Base Attack Bonus": "+1", "Fort Save": "+2", "Ref Save": "+0", "Will Save": "+2", Special: "Fighting Style, Akashic Arsenal, Essence Bound Duty", Veils: "1+1", Essence: "1" },
  { Level: "2nd", "Base Attack Bonus": "+2", "Fort Save": "+3", "Ref Save": "+0", "Will Save": "+3", Special: "Chakra Bind (Low), Akashic Arsenal", Veils: "2+1", Essence: "2" },
  { Level: "4th", "Base Attack Bonus": "+4", "Fort Save": "+4", "Ref Save": "+1", "Will Save": "+4", Special: "Improved Essence Capacity +1, Fighting Style", Veils: "2+2", Essence: "3" },
  { Level: "10th", "Base Attack Bonus": "+10/+5", "Fort Save": "+7", "Ref Save": "+3", "Will Save": "+7", Special: "Improved Essence Capacity +2, Improved Fighting Style", Veils: "4+2", Essence: "8" },
];

// Synthetic: a well-formed Binds column + plural/duplicate bind text (covers the /^binds?$/ and
// /chakra binds?/ alternates the real rows can't — only the Rajah has a Binds column, header-lost).
// The 4th row's "5 (2)" Veils cell locks the footnote style: FIRST integer, never a sum.
const SYNTH_PROG = [
  ["Level", "Base Attack Bonus", "Special", "Veils", "Binds", "Essence"],
  ["1st", "+0", "Veilweaving", "1", "0", "2"],
  ["2nd", "+1", "Chakra binds (Wrists)", "2", "1", "4"],
  ["3rd", "+2", "Chakra bind (wrists), chakra bind (Blood)", "2", "2", "6"],
  ["4th", "+3", "Veilweaving", "5 (2)", "2", "8"],
];

describe("readAkashicProgressionMaxes", () => {
  it("reads Veils + Essence from the REAL Helmsman header-row shape", () => {
    expect(readAkashicProgressionMaxes(HELMSMAN_PROG, 1)).toEqual({ essence: 1, veils: 1, binds: undefined });
    expect(readAkashicProgressionMaxes(HELMSMAN_PROG, 4)).toEqual({ essence: 4, veils: 2, binds: undefined });
    expect(readAkashicProgressionMaxes(HELMSMAN_PROG, 20)).toEqual({ essence: 20, veils: 10, binds: undefined });
  });

  it("handles the Miraheze object format (Vizier) via normalizeProgression", () => {
    expect(readAkashicProgressionMaxes(VIZIER_PROG, 2)).toEqual({ essence: 2, veils: 3, binds: undefined });
    expect(readAkashicProgressionMaxes(VIZIER_PROG, 20)).toEqual({ essence: 30, veils: 11, binds: undefined });
  });

  it("essence-only classes (Zodiac) leave veils unset", () => {
    expect(readAkashicProgressionMaxes(ZODIAC_PROG, 3)).toEqual({ essence: 3, veils: undefined, binds: undefined });
  });

  it("a level the table doesn't cover yields {}", () => {
    expect(readAkashicProgressionMaxes(HELMSMAN_PROG, 10)).toEqual({});
    expect(readAkashicProgressionMaxes(VIZIER_PROG, 5)).toEqual({});
  });

  it("SPLIT 'base+bonus' Veils cells sum to the real total (Daevic/Kheshig/Pactbound)", () => {
    // Daevic L1 "0+1" is 1 veil (the passion veil) — first-int read 0 falsely flagged the ONLY
    // legal shaped veil as over-max; L4 "1+2" is 3.
    expect(readAkashicProgressionMaxes(DAEVIC_PROG, 1)).toEqual({ essence: 1, veils: 1, binds: undefined });
    expect(readAkashicProgressionMaxes(DAEVIC_PROG, 4)).toEqual({ essence: 2, veils: 3, binds: undefined });
    expect(readAkashicProgressionMaxes(DAEVIC_PROG, 12)).toEqual({ essence: 6, veils: 6, binds: undefined });
    expect(readAkashicProgressionMaxes(KHESHIG_PROG, 1)).toEqual({ essence: 1, veils: 2, binds: undefined });
    expect(readAkashicProgressionMaxes(KHESHIG_PROG, 10)).toEqual({ essence: 8, veils: 6, binds: undefined });
    expect(readAkashicProgressionMaxes(PACTBOUND_PROG, 1)).toEqual({ essence: 2, veils: 1, binds: undefined });
    expect(readAkashicProgressionMaxes(PACTBOUND_PROG, 9)).toEqual({ essence: 11, veils: 5, binds: undefined });
  });

  it("footnote-style cells ('5 (2)', '5¹') still read the FIRST integer — never a sum", () => {
    expect(readAkashicProgressionMaxes(SYNTH_PROG, 4)).toEqual({ essence: 8, veils: 5, binds: 2 });
  });

  it("the Rajah's lost-header table degrades to {} (never throws, never mis-parses)", () => {
    expect(readAkashicProgressionMaxes(RAJAH_PROG, 1)).toEqual({});
    expect(readAkashicProgressionMaxes(RAJAH_PROG, 20)).toEqual({});
  });

  it("reads a well-formed Binds column when one exists", () => {
    expect(readAkashicProgressionMaxes(SYNTH_PROG, 3)).toEqual({ essence: 6, veils: 2, binds: 2 });
  });

  it("non-akashic progressions (no Essence column) and garbage yield {}", () => {
    const core = [
      ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special"],
      ["1st", "+1", "+2", "+0", "+0", "Bonus feat"],
    ];
    expect(readAkashicProgressionMaxes(core, 1)).toEqual({});
    expect(readAkashicProgressionMaxes(null, 1)).toEqual({});
    expect(readAkashicProgressionMaxes("nonsense", 1)).toEqual({});
    expect(readAkashicProgressionMaxes([], 1)).toEqual({});
  });
});

describe("parseBindUnlocks", () => {
  it("collects 'Chakra bind (…)' features at levels ≤ classLevel, in unlock order, lowercased", () => {
    expect(parseBindUnlocks(HELMSMAN_PROG, 1)).toEqual([]);
    expect(parseBindUnlocks(HELMSMAN_PROG, 2)).toEqual(["hands"]);
    expect(parseBindUnlocks(HELMSMAN_PROG, 4)).toEqual(["hands", "feet"]);
    expect(parseBindUnlocks(HELMSMAN_PROG, 20)).toEqual(["hands", "feet", "body"]);
  });

  it("handles the object format + case drift (the Vizier's 'Chakra bind (Hands)')", () => {
    expect(parseBindUnlocks(VIZIER_PROG, 8)).toEqual(["hands", "feet", "head", "wrists"]);
    // L9's "ring binding" (gerund, no "chakra") and L16's plural "Chakra bind (Belts)" both seed.
    expect(parseBindUnlocks(VIZIER_PROG, 9)).toEqual(["hands", "feet", "head", "wrists", "ring"]);
    expect(parseBindUnlocks(VIZIER_PROG, 20)).toEqual(["hands", "feet", "head", "wrists", "ring", "belts", "body"]);
  });

  it("tier-PREFIX binds with no parens seed the tier string (Amanuensis/Pactbound)", () => {
    expect(parseBindUnlocks(AMANUENSIS_PROG, 1)).toEqual([]);
    expect(parseBindUnlocks(AMANUENSIS_PROG, 3)).toEqual(["low"]); // "Binding Words" never matches
    expect(parseBindUnlocks(AMANUENSIS_PROG, 12)).toEqual(["low", "middle"]);
    expect(parseBindUnlocks(AMANUENSIS_PROG, 18)).toEqual(["low", "middle", "high", "pinnacle"]);
    expect(parseBindUnlocks(PACTBOUND_PROG, 2)).toEqual(["low"]); // "Bind Companion Spirit" never matches
    expect(parseBindUnlocks(PACTBOUND_PROG, 20)).toEqual(["low", "middle", "high", "pinnacle"]);
  });

  it("slot-prefix binds seed the slot (the Daevic's L12 'Blood bind')", () => {
    expect(parseBindUnlocks(DAEVIC_PROG, 11)).toEqual(["feet", "hands"]);
    expect(parseBindUnlocks(DAEVIC_PROG, 12)).toEqual(["feet", "hands", "blood"]);
    expect(parseBindUnlocks(DAEVIC_PROG, 13)).toEqual(["feet", "hands", "blood", "belt"]);
  });

  it("parenthesized TIER binds ('Chakra Bind (Low)') seed once — no double capture (Kheshig)", () => {
    expect(parseBindUnlocks(KHESHIG_PROG, 2)).toEqual(["low"]);
  });

  it("'Chakra disruption (hands)' is NOT a bind (the Guru's L3 feature)", () => {
    expect(parseBindUnlocks(GURU_PROG, 3)).toEqual(["hands"]);
  });

  it("accepts the plural 'Chakra binds', de-dupes, and keeps nonstandard slots as free strings", () => {
    expect(parseBindUnlocks(SYNTH_PROG, 3)).toEqual(["wrists", "blood"]);
  });

  it("lost-header (Rajah) and garbage tables yield []", () => {
    expect(parseBindUnlocks(RAJAH_PROG, 20)).toEqual([]);
    expect(parseBindUnlocks(null, 5)).toEqual([]);
    expect(parseBindUnlocks("nonsense", 5)).toEqual([]);
  });
});

describe("parseCapacityBonus", () => {
  it("reads 'Improved essence capacity +N' at levels ≤ classLevel — the REAL Vizier L3 row", () => {
    expect(parseCapacityBonus(VIZIER_PROG, 2)).toBe(0);
    expect(parseCapacityBonus(VIZIER_PROG, 3)).toBe(1); // "Improved essence capacity +1, veilshifting"
    expect(parseCapacityBonus(VIZIER_PROG, 10)).toBe(1);
    expect(parseCapacityBonus(VIZIER_PROG, 11)).toBe(2);
    expect(parseCapacityBonus(VIZIER_PROG, 20)).toBe(3);
  });

  it("case drift + numbered variants (Helmsman lowercase, Kheshig, Zodiac)", () => {
    expect(parseCapacityBonus(HELMSMAN_PROG, 2)).toBe(0);
    expect(parseCapacityBonus(HELMSMAN_PROG, 3)).toBe(1); // "…improved essence capacity +1"
    expect(parseCapacityBonus(KHESHIG_PROG, 4)).toBe(1);
    expect(parseCapacityBonus(KHESHIG_PROG, 10)).toBe(2);
    expect(parseCapacityBonus(ZODIAC_PROG, 3)).toBe(1);
  });

  it("abbreviated parenthesized form — the Amanuensis's 'Imp. Essence Capacity (+2)'", () => {
    expect(parseCapacityBonus(AMANUENSIS_PROG, 3)).toBe(1);
    expect(parseCapacityBonus(AMANUENSIS_PROG, 9)).toBe(2);
    expect(parseCapacityBonus(AMANUENSIS_PROG, 20)).toBe(3);
  });

  it("the Pactbound's UNNUMBERED 'Imp. Essence Cap.' steps once per occurrence", () => {
    expect(parseCapacityBonus(PACTBOUND_PROG, 2)).toBe(0);
    expect(parseCapacityBonus(PACTBOUND_PROG, 3)).toBe(1);
    expect(parseCapacityBonus(PACTBOUND_PROG, 9)).toBe(2);
    expect(parseCapacityBonus(PACTBOUND_PROG, 15)).toBe(3);
  });

  it("'Improved Passion Capacity' (Daevic) is NOT essence capacity; garbage yields 0", () => {
    expect(parseCapacityBonus(DAEVIC_PROG, 13)).toBe(0);
    expect(parseCapacityBonus(RAJAH_PROG, 20)).toBe(0);
    expect(parseCapacityBonus(null, 5)).toBe(0);
    expect(parseCapacityBonus("nonsense", 5)).toBe(0);
  });
});

describe("classLevelFor (shared with the PoW editor)", () => {
  const identity = {
    classes: [
      { name: "Fighter", level: 5 },
      { name: "Vizier (Crafter)", level: 3 },
    ],
    totalLevel: 8,
  };

  it("a matching identity.classes row wins (case-insensitive, archetype parentheticals stripped)", () => {
    expect(classLevelFor(identity, "vizier")).toBe(3);
    expect(classLevelFor(identity, "Fighter")).toBe(5);
  });

  it("falls back to totalLevel when no class row matches; floors at 1", () => {
    expect(classLevelFor(identity, "Guru")).toBe(8);
    expect(classLevelFor({ classes: [], totalLevel: 0 }, "Guru")).toBe(1);
  });
});
