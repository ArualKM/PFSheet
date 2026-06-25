import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "./factory";
import {
  pathForgeCharacterV1Schema,
  CHARACTER_SCHEMA_VERSION,
} from "./character";
import { parseCharacter, safeParseCharacter, migrateCharacter } from "./validate";
import { DEFAULT_SKILLS } from "./skills";
import { sampleFighter } from "./fixtures";

describe("createDefaultCharacter", () => {
  it("produces a schema-valid PF1e character", () => {
    const c = createDefaultCharacter();
    expect(() => pathForgeCharacterV1Schema.parse(c)).not.toThrow();
    expect(c.schemaVersion).toBe(CHARACTER_SCHEMA_VERSION);
    expect(c.system).toBe("pf1e");
  });

  it("seeds the six core abilities at 10", () => {
    const c = createDefaultCharacter();
    for (const key of ["str", "dex", "con", "int", "wis", "cha"] as const) {
      expect(c.abilities.primary[key]?.score).toBe(10);
    }
  });

  it("includes the standard non-repeatable skills", () => {
    const c = createDefaultCharacter();
    const expected = DEFAULT_SKILLS.filter((s) => !s.repeatable).length;
    expect(c.skills.list).toHaveLength(expected);
    expect(c.skills.list.find((s) => s.key === "perception")).toBeTruthy();
  });

  it("honors a provided name", () => {
    expect(createDefaultCharacter({ name: "Kael Viren" }).identity.name).toBe("Kael Viren");
    expect(createDefaultCharacter({ name: "   " }).identity.name).toBe("New Character");
  });
});

describe("validation", () => {
  it("parses a valid character", () => {
    expect(() => parseCharacter(createDefaultCharacter())).not.toThrow();
  });

  it("rejects malformed character data", () => {
    const result = safeParseCharacter({ schemaVersion: "nope", system: "dnd5e" });
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input in migrate", () => {
    expect(migrateCharacter(null).ok).toBe(false);
    expect(migrateCharacter(42).ok).toBe(false);
  });

  it("validates the sample fighter fixture", () => {
    expect(() => parseCharacter(sampleFighter())).not.toThrow();
  });
});
