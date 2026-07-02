import { describe, it, expect } from "vitest";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import { enabledThreeppSystems, THREEPP_SYSTEM_LABEL } from "@/lib/character/threepp";

function withModules(...keys: string[]): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "X" });
  for (const key of keys) c.rules.modules.push({ key, enabled: true, settings: {} });
  return c;
}

describe("enabledThreeppSystems (3pp picker gating)", () => {
  it("is empty on a default character — no 3pp union queries fire", () => {
    expect(enabledThreeppSystems(createDefaultCharacter({ name: "X" }))).toEqual([]);
  });

  it("maps each module key to its system tag", () => {
    expect(enabledThreeppSystems(withModules("psionics"))).toEqual(["psionic"]);
    expect(enabledThreeppSystems(withModules("path_of_war"))).toEqual(["path_of_war"]);
    expect(enabledThreeppSystems(withModules("akashic"))).toEqual(["akashic"]);
    expect(enabledThreeppSystems(withModules("spheres_of_power"))).toEqual(["spheres"]);
  });

  it("dedupes the spheres trio to a single 'spheres' system", () => {
    const c = withModules("spheres_of_power", "spheres_of_might", "spheres_of_guile");
    expect(enabledThreeppSystems(c)).toEqual(["spheres"]);
  });

  it("combines independent systems (order-independent set)", () => {
    const c = withModules("psionics", "akashic", "spheres_of_might");
    expect(new Set(enabledThreeppSystems(c))).toEqual(new Set(["psionic", "akashic", "spheres"]));
  });

  it("ignores unknown / unrelated modules — unknown means off", () => {
    // "rune_magic" and "other" are system TAGS on compendium rows, not module keys; a sheet
    // carrying them (or any garbage key) must never open the 3pp union.
    const c = withModules("rune_magic", "other", "not_a_module", "mythic", "hero_points");
    expect(enabledThreeppSystems(c)).toEqual([]);
  });

  it("treats enabled: false as off", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.rules.modules.push({ key: "psionics", enabled: false, settings: {} });
    expect(enabledThreeppSystems(c)).toEqual([]);
  });

  it("labels every surfaceable system for the picker badge", () => {
    const c = withModules("psionics", "path_of_war", "akashic", "spheres_of_guile");
    for (const system of enabledThreeppSystems(c)) {
      expect(THREEPP_SYSTEM_LABEL[system]).toBeTruthy();
    }
  });
});
