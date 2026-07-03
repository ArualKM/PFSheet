import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  parseCharacter,
  backgroundOccupationBlockSchema,
  parseOccupationFeats,
} from "@pathforge/schema";

describe("backgrounds & occupations — schema", () => {
  it("parses an empty block to clean defaults", () => {
    expect(backgroundOccupationBlockSchema.parse({})).toEqual({});
  });

  it("existing sheets parse unchanged (no block)", () => {
    const c = createDefaultCharacter({ name: "Vanilla" });
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.backgroundOccupation).toBeUndefined();
  });

  it("round-trips a populated block", () => {
    const c = createDefaultCharacter({ name: "Townsfolk" });
    c.rules.modules.push({ key: "backgrounds_occupations", enabled: true, settings: {} });
    c.backgroundOccupation = {
      background: { name: "Rural", compendiumId: "3pp:rural", description: "From the countryside." },
      occupation: {
        name: "Arcane Student",
        compendiumId: "3pp:arcane-student",
        benefit: "Alignment: Any\n\nSkills: Choose 2 of the following skills as class skills.",
        grantedFeat: "Knowledge (arcana), Spellcraft\n\nBonus Feat: Choose either Spell Focus or Spell Mastery.",
        description: "Studies magic.",
      },
      notes: "Chose Spellcraft + Knowledge (arcana) as class skills.",
    };
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.backgroundOccupation).toEqual(c.backgroundOccupation);
  });
});

describe("parseOccupationFeats — the 'Bonus Feat:' clause", () => {
  it("extracts an either/or choice", () => {
    expect(
      parseOccupationFeats(
        "Knowledge (arcana), Knowledge (the planes), Linguistics, Spellcraft, Use Magic Device<br><br>Bonus Feat: Choose either Spell Focus or Spell Mastery.",
      ),
    ).toEqual(["Spell Focus", "Spell Mastery"]);
  });

  it("extracts a comma+or list", () => {
    expect(
      parseOccupationFeats(
        "Acrobatics, Climb, Escape Artist, Handle Animal, Profession, Ride, Swim<br><br>Bonus Feat: Choose Athletic, Endurance, or Run.",
      ),
    ).toEqual(["Athletic", "Endurance", "Run"]);
  });

  it("never mistakes the skill list for feats when no clause exists", () => {
    expect(parseOccupationFeats("Skills: Choose 2 of the following skills as class skills.")).toEqual([]);
    expect(parseOccupationFeats("")).toEqual([]);
    expect(parseOccupationFeats(null)).toEqual([]);
    expect(parseOccupationFeats(undefined)).toEqual([]);
  });
});
