import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  applyClassPreset,
  getClassPreset,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { characterSummary, characterStats, discordCard } from "@/lib/character/api-shapes";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { API_BASE, API_ENDPOINTS } from "@/lib/api/catalog";

function anonView(character: PathForgeCharacterV1) {
  const computed = computeCharacter(character);
  return buildCharacterViewModel(character, computed, "anonymous", "public");
}

describe("public API privacy", () => {
  it("serves public-safe sections to anonymous callers", () => {
    const c = createDefaultCharacter();
    c.identity.name = "Public Hero";
    const vm = anonView(c);
    expect(characterSummary(vm).name).toBe("Public Hero");
    // Abilities/skills/attacks default to public, so an anonymous caller can see them.
    expect(characterStats(vm).abilities.length).toBeGreaterThan(0);
    expect(characterStats(vm).skills).not.toBeNull();
    expect(characterStats(vm).attacks).not.toBeNull();
  });

  it("never leaks sections the share settings mark private", () => {
    const c = createDefaultCharacter();
    c.privacy.sections.abilities = "private";
    c.privacy.sections.skills = "private";
    c.privacy.sections.attacks = "owner_only";
    const vm = anonView(c);
    // Abilities must be gated like every other section (regression: it used to leak).
    expect(characterStats(vm).abilities).toEqual([]);
    expect(characterStats(vm).skills).toBeNull();
    expect(characterStats(vm).attacks).toBeNull();
    // The Discord card derives top skills from the (now gated) skills — must be empty.
    expect(discordCard(vm).topSkills).toEqual([]);
  });

  it("exposes spellcasting when public and gates it when private", () => {
    const visible = createDefaultCharacter();
    applyClassPreset(visible, { preset: getClassPreset("wizard")!, level: 5 });
    const okVm = anonView(visible);
    expect(characterStats(okVm).spellcasting).not.toBeNull();
    expect(characterStats(okVm).spellcasting!.casters[0]?.className).toBe("Wizard");
    expect(characterSummary(okVm).spellcasting?.casterCount).toBe(1);

    const hidden = createDefaultCharacter();
    applyClassPreset(hidden, { preset: getClassPreset("wizard")!, level: 5 });
    hidden.privacy.sections.spells = "private";
    const hiddenVm = anonView(hidden);
    expect(characterStats(hiddenVm).spellcasting).toBeNull();
    expect(characterSummary(hiddenVm).spellcasting).toBeNull();
    expect(discordCard(hiddenVm).preparedHighlights).toEqual([]);
  });
});

describe("OpenAPI spec", () => {
  it("documents every catalog endpoint", () => {
    const spec = buildOpenApiSpec("https://example.com");
    for (const ep of API_ENDPOINTS) {
      expect(spec.paths[`${API_BASE}${ep.path}`]?.get).toBeDefined();
    }
  });

  it("requires bearer auth on authenticated endpoints", () => {
    const spec = buildOpenApiSpec("https://example.com");
    const keyed = API_ENDPOINTS.find((e) => e.auth === "key")!;
    const op = spec.paths[`${API_BASE}${keyed.path}`]!.get as { security?: unknown };
    expect(op.security).toBeDefined();
  });
});
