import { describe, it, expect } from "vitest";
import {
  matchesManifesterClass,
  extractPpCost,
  parseJunctionLevel,
  disciplineParts,
  baseDiscipline,
  brToNewlines,
  groupPowersByLevel,
} from "@/lib/character/psionic-powers";

describe("matchesManifesterClass — compound junction class values", () => {
  it("matches a plain class against a compound junction value", () => {
    expect(matchesManifesterClass("Psion/Wilder", "Psion")).toBe(true);
    expect(matchesManifesterClass("Psion/Wilder", "Wilder")).toBe(true);
    expect(matchesManifesterClass("Psychic Warrior", "Psychic Warrior")).toBe(true);
  });

  it("is case-insensitive and whitespace/paren tolerant", () => {
    expect(matchesManifesterClass("Psion/Wilder", "psion")).toBe(true);
    expect(matchesManifesterClass("Psychic Warrior", "psychic  warrior")).toBe(true);
    expect(matchesManifesterClass("Psychic Warrior", "Psychic Warrior (Meditant)")).toBe(true);
    expect(matchesManifesterClass("Psion/Wilder", " Wilder ")).toBe(true);
  });

  it("requires whole-segment matches (no substring over-matching)", () => {
    expect(matchesManifesterClass("Psychic Warrior", "Psion")).toBe(false);
    expect(matchesManifesterClass("Psion/Wilder", "Psychic Warrior")).toBe(false);
    expect(matchesManifesterClass("Wilder", "Wild")).toBe(false);
  });

  it("handles empty/blank class names safely", () => {
    expect(matchesManifesterClass("Psion/Wilder", "")).toBe(false);
    expect(matchesManifesterClass("", "Psion")).toBe(false);
    expect(matchesManifesterClass("Psion/Wilder", "()")).toBe(false);
  });

  it("a junction class of 'All' covers every manifester class (13 prod rows)", () => {
    expect(matchesManifesterClass("All", "Psion")).toBe(true);
    expect(matchesManifesterClass("All", "Psychic Warrior")).toBe(true);
    expect(matchesManifesterClass("all", "Wilder")).toBe(true);
    expect(matchesManifesterClass("All", "Psion/Wilder")).toBe(true);
    // Still requires a non-empty character class, and 'All' can't over-match as a substring.
    expect(matchesManifesterClass("All", "")).toBe(false);
    expect(matchesManifesterClass("Tactician", "All-Seer")).toBe(false);
  });
});

describe("extractPpCost — BARE-integer power_points only", () => {
  it("extracts bare integer costs", () => {
    expect(extractPpCost("1")).toBe(1);
    expect(extractPpCost("  7 ")).toBe(7);
    expect(extractPpCost("11")).toBe(11);
  });

  it("refuses per-class-variant and annotated shapes (the real prod rows)", () => {
    // Per-class variants — the leading integer would be WRONG for other classes.
    expect(extractPpCost("13 telepath and tactician, 11 dread")).toBeUndefined();
    expect(extractPpCost("3 (dread), 5 (psion/wilder)")).toBeUndefined();
    expect(extractPpCost("3, telepath 1")).toBeUndefined();
    expect(extractPpCost("5 (gifted blade, marksman), 7 (psychic warrior)")).toBeUndefined();
    // Conditional / annotated shapes stay detail-text-only.
    expect(extractPpCost("Psionic focus or 1")).toBeUndefined();
    expect(extractPpCost("3 (see text)")).toBeUndefined();
    expect(extractPpCost("5/round")).toBeUndefined();
  });

  it("returns undefined for missing/non-numeric text", () => {
    expect(extractPpCost("see text")).toBeUndefined();
    expect(extractPpCost("varies (1 minimum)")).toBeUndefined();
    expect(extractPpCost("")).toBeUndefined();
    expect(extractPpCost(null)).toBeUndefined();
    expect(extractPpCost(undefined)).toBeUndefined();
  });
});

describe("parseJunctionLevel — text level column", () => {
  it("parses and clamps to the 0-9 power-level range", () => {
    expect(parseJunctionLevel("1")).toBe(1);
    expect(parseJunctionLevel("0")).toBe(0);
    expect(parseJunctionLevel("9")).toBe(9);
    expect(parseJunctionLevel("12")).toBe(9);
  });

  it("returns undefined for missing/non-numeric levels", () => {
    expect(parseJunctionLevel(null)).toBeUndefined();
    expect(parseJunctionLevel(undefined)).toBeUndefined();
    expect(parseJunctionLevel("—")).toBeUndefined();
  });
});

describe("discipline helpers — '<br>' compounds", () => {
  it("splits <br> compounds into clean parts", () => {
    expect(disciplineParts("Metacreativity (Creation)<br>Psychokinesis")).toEqual([
      "Metacreativity (Creation)",
      "Psychokinesis",
    ]);
    expect(disciplineParts("Telepathy (Charm) [Mind-Affecting]<br/>Clairsentience")).toEqual([
      "Telepathy (Charm) [Mind-Affecting]",
      "Clairsentience",
    ]);
    expect(disciplineParts(null)).toEqual([]);
  });

  it("extracts the base discipline of a part", () => {
    expect(baseDiscipline("Telepathy (Charm) [Mind-Affecting]")).toBe("Telepathy");
    expect(baseDiscipline("Psychokinesis [Force]")).toBe("Psychokinesis");
    expect(baseDiscipline("Clairsentience")).toBe("Clairsentience");
  });

  it("converts <br> rich text to plain newlines", () => {
    expect(brToNewlines("Line one<br>Line two<br/>Line three")).toBe("Line one\nLine two\nLine three");
    expect(brToNewlines("  <br> ")).toBeUndefined();
    expect(brToNewlines(null)).toBeUndefined();
  });
});

describe("groupPowersByLevel — read-view grouping", () => {
  it("groups ascending by level, names sorted within a group", () => {
    const groups = groupPowersByLevel([
      { name: "Mind Thrust", level: 1 },
      { name: "Energy Ray", level: 1 },
      { name: "Ego Whip", level: 2 },
      { name: "Create Sound", level: 0 },
    ]);
    expect(groups.map((g) => g.level)).toEqual([0, 1, 2]);
    expect(groups[1]!.powers.map((p) => p.name)).toEqual(["Energy Ray", "Mind Thrust"]);
  });
});
