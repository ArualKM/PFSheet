import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createDefaultCharacter } from "@pathforge/schema";

// The save action isn't under test here; make compute controllable so we can force a throw.
vi.mock("@/lib/actions/characters", () => ({
  saveCharacterSheetAction: vi.fn().mockResolvedValue({ ok: true, version: 2 }),
}));
const { computeMock } = vi.hoisted(() => ({ computeMock: vi.fn() }));
vi.mock("@pathforge/rules-pf1e", async (orig) => {
  const actual = await orig<typeof import("@pathforge/rules-pf1e")>();
  return { ...actual, computeCharacter: computeMock };
});

import { useCharacterEditor } from "@/components/character/editor/use-character-editor";

describe("editor survives a compute throw (no 'full dies')", () => {
  it("falls back to the loaded sheet's values and keeps the draft instead of crashing", () => {
    const base = createDefaultCharacter({ name: "A" });
    // Compute throws ONLY for the edited draft; the loaded sheet (name "A") still computes — exactly the
    // real situation where a transient draft value is bad but the loaded sheet is fine.
    computeMock.mockImplementation((c: { identity?: { name?: string } }) => {
      if (c?.identity?.name === "B") throw new Error("boom");
      return { summary: { marker: "good" } };
    });

    const { result } = renderHook(() => useCharacterEditor("c1", base, 1));
    const good = () => (result.current.computed as unknown as { summary: { marker: string } }).summary.marker;
    expect(good()).toBe("good");

    expect(() =>
      act(() => result.current.update((d) => void (d.identity.name = "B"))),
    ).not.toThrow();

    // The editor survived (fell back to the loaded values) and the draft still advanced.
    expect(good()).toBe("good");
    expect(result.current.draft.identity.name).toBe("B");
  });
});
