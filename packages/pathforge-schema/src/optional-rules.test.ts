import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "./factory";
import { OPTIONAL_RULE_MODULES, isRuleEnabled, isModuleKeyEnabled } from "./optional-rules";

describe("optional rule modules", () => {
  it("a default character has no optional rules enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(OPTIONAL_RULE_MODULES.some((m) => isRuleEnabled(c, m))).toBe(false);
  });

  it("Mythic toggles via rules.variants", () => {
    const c = createDefaultCharacter({ name: "X" });
    const mythic = OPTIONAL_RULE_MODULES.find((m) => m.key === "mythic")!;
    expect(isRuleEnabled(c, mythic)).toBe(false);
    c.rules.variants.mythic = true;
    expect(isRuleEnabled(c, mythic)).toBe(true);
    expect(isModuleKeyEnabled(c, "mythic")).toBe(true);
  });

  it("third-party modules toggle via rules.modules", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(isModuleKeyEnabled(c, "path_of_war")).toBe(false);
    c.rules.modules.push({ key: "path_of_war", enabled: true, settings: {} });
    expect(isModuleKeyEnabled(c, "path_of_war")).toBe(true);
    // a disabled entry is not "enabled"
    c.rules.modules = [{ key: "path_of_war", enabled: false, settings: {} }];
    expect(isModuleKeyEnabled(c, "path_of_war")).toBe(false);
  });

  it("every module stores either a variant flag or a modules[] key", () => {
    for (const m of OPTIONAL_RULE_MODULES) {
      expect(typeof m.key).toBe("string");
      expect(["paizo", "subsystem", "thirdparty"]).toContain(m.group);
    }
  });
});
