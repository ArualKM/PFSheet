import { describe, it, expect } from "vitest";
import { parsePsionicPowers } from "@pathforge/schema";

const ENERGY_RAY = `Energy Ray
Discipline psychokinesis [see text]; Level psion/wilder 1
Display auditory or visual
Manifesting Time 1 standard action
Range close (25 ft. + 5 ft./2 levels)
Effect ray
Duration instantaneous
Saving Throw none; Power Resistance yes
Power Points 1
You tap the power of your mind to project a ray of energy.
Augment: For every additional power point you spend, this power's damage increases by 1d6.`;

describe("parsePsionicPowers", () => {
  it("extracts name, level, discipline, PP, and augment from a statblock", () => {
    const { powers } = parsePsionicPowers(ENERGY_RAY);
    expect(powers).toHaveLength(1);
    const p = powers[0]!;
    expect(p.name).toBe("Energy Ray");
    expect(p.level).toBe(1);
    expect(p.discipline).toBe("psychokinesis");
    expect(p.ppCost).toBe(1);
    expect(p.augment).toContain("1d6");
    expect(p.description).toContain("project a ray"); // never-discard preserves the body
  });

  it("parses multiple blank-line-separated powers", () => {
    const two = `${ENERGY_RAY}\n\nMind Thrust\nLevel psion/wilder 1\nPower Points 1\nYou instantly deal 1d10 damage.`;
    expect(parsePsionicPowers(two).powers.map((p) => p.name)).toEqual(["Energy Ray", "Mind Thrust"]);
  });

  it("takes the lowest class level when several are listed", () => {
    const { powers } = parsePsionicPowers(
      "Astral Construct\nLevel psion/wilder 1, cryptic 2\nPower Points 1\nYou create a construct.",
    );
    expect(powers[0]!.level).toBe(1);
  });

  it("is lenient: a missing level defaults to 1 with a warning, nothing discarded", () => {
    const { powers, warnings } = parsePsionicPowers("Mystery Power\nSome flavor text with no stats.");
    expect(powers[0]!.level).toBe(1);
    expect(powers[0]!.description).toContain("flavor text");
    expect(warnings.some((w) => /level/i.test(w))).toBe(true);
  });

  it("warns on empty input", () => {
    expect(parsePsionicPowers("").powers).toHaveLength(0);
    expect(parsePsionicPowers("   ").warnings.length).toBeGreaterThan(0);
  });
});
