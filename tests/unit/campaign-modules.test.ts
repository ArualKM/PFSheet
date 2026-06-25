import { describe, it, expect } from "vitest";
import { enabledModuleKeys, moduleName } from "@/lib/character/campaign-modules";

describe("enabledModuleKeys", () => {
  it("normalizes string and { key } entries", () => {
    expect(enabledModuleKeys(["mythic", { key: "psionics" }])).toEqual(["mythic", "psionics"]);
  });

  it("drops nullish/empty/non-string keys instead of stringifying them", () => {
    expect(enabledModuleKeys([{ key: null }, { key: undefined }, { key: 5 }, "", null, 3, {}])).toEqual([]);
  });

  it("returns [] for non-array input", () => {
    expect(enabledModuleKeys(null)).toEqual([]);
    expect(enabledModuleKeys({ key: "mythic" })).toEqual([]);
  });
});

describe("moduleName", () => {
  it("resolves a known key and falls back to the raw key", () => {
    expect(moduleName("mythic")).toBe("Mythic Adventures");
    expect(moduleName("nonexistent")).toBe("nonexistent");
  });
});
