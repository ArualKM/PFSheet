import { describe, it, expect } from "vitest";
import { rankVeils, veilSlotOptions, veilMatchesSlot } from "@/lib/character/akashic-veils";

/**
 * 3PP Phase 5 — the veil picker's pure helpers (the maneuver-picker client-ranking pattern). The
 * slot cells mirror real prod `akashic_veil_compendium` values: comma-multi slots ("Belt, Body,
 * Feet, Shoulders"), nonstandard slots ("Storm"), and the "see text" suffix are all in the data.
 */

const ROWS = [
  { name: "Armory of the Conqueror", slot: "Hands", descriptors: null, effect: "Summon a weapon of force.", bind_effect: "Blood bind: the weapon burns." },
  { name: "Arms of the Bear", slot: "Hands, Wrists", descriptors: "strength", effect: "Your arms grow mighty.", bind_effect: null },
  { name: "Storm Gorget", slot: "Storm", descriptors: "electricity", effect: null, bind_effect: null },
  { name: "Bear's Endurance Shroud", slot: "Chest", descriptors: null, effect: "Grants a bear's stamina.", bind_effect: null },
  { name: "Veil of Mists", slot: "Hands, Body, see text", descriptors: null, effect: "You become vaporous.", bind_effect: null },
];

describe("rankVeils", () => {
  it("passes rows through unchanged on a blank query", () => {
    expect(rankVeils(ROWS, "  ")).toEqual(ROWS);
  });

  it("ranks exact name over prefix over contains over rules text, dropping non-matches", () => {
    const rows = [
      { name: "Bear", slot: null, effect: null, bind_effect: null, descriptors: null },
      ...ROWS,
    ];
    const out = rankVeils(rows, "bear");
    expect(out.map((r) => r.name)).toEqual([
      "Bear", // exact
      "Bear's Endurance Shroud", // prefix
      "Arms of the Bear", // contains
    ]);
  });

  it("falls back to slot/descriptor/effect/bind text (never hides a text match)", () => {
    expect(rankVeils(ROWS, "electricity").map((r) => r.name)).toEqual(["Storm Gorget"]);
    expect(rankVeils(ROWS, "blood bind").map((r) => r.name)).toEqual(["Armory of the Conqueror"]);
    expect(rankVeils(ROWS, "vaporous").map((r) => r.name)).toEqual(["Veil of Mists"]);
  });

  it("alphabetizes within a tier", () => {
    // "Armory…"/"Arms…" are name-prefix matches (alphabetical within the tier); "Bear's…" only
    // CONTAINS "ar", so it ranks after both.
    expect(rankVeils(ROWS, "ar").map((r) => r.name)).toEqual([
      "Armory of the Conqueror",
      "Arms of the Bear",
      "Bear's Endurance Shroud",
    ]);
  });
});

describe("veilSlotOptions", () => {
  it("splits comma-multi cells into distinct singles, canonical slots first, extras alpha last", () => {
    const out = veilSlotOptions(ROWS.map((r) => r.slot));
    // Canonical body order (only the slots present in the data), then nonstandard alphabetically
    // (locale compare — "see text" sorts before "Storm").
    expect(out).toEqual(["Hands", "Wrists", "Chest", "Body", "see text", "Storm"]);
  });

  it("dedups case-insensitively keeping the first-seen casing and ignores blank cells", () => {
    expect(veilSlotOptions(["Hands, hands", null, undefined, "", "HANDS"])).toEqual(["Hands"]);
  });
});

describe("veilMatchesSlot", () => {
  it("matches case-insensitively against the parsed slot list", () => {
    expect(veilMatchesSlot(["Hands", "Wrists"], "hands")).toBe(true);
    expect(veilMatchesSlot(["Hands", "Wrists"], "Feet")).toBe(false);
  });

  it("never hides a veil with no cached slots, and no chosen slot matches everything", () => {
    expect(veilMatchesSlot([], "Hands")).toBe(true);
    expect(veilMatchesSlot(["Hands"], "")).toBe(true);
    expect(veilMatchesSlot(["Hands"], "   ")).toBe(true);
  });
});
