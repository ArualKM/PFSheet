import { describe, it, expect } from "vitest";
import {
  DELETE_CONFIRM_FALLBACK,
  deleteConfirmMatches,
  deleteConfirmTarget,
} from "@/lib/character/delete-confirm";

// The one shared match used by BOTH the client dialog gate and deleteCharacterAction's
// server-side re-verification — an adversarial review caught the two sides comparing
// differently (client untrimmed-exact, server trimmed), which made whitespace-padded
// names unsatisfiable on both, and an empty stored name logically undeletable.
describe("deleteConfirmTarget", () => {
  it("returns the trimmed name for normal names", () => {
    expect(deleteConfirmTarget("Elandra")).toBe("Elandra");
    expect(deleteConfirmTarget("  Elandra  ")).toBe("Elandra");
  });

  it("falls back to the literal DELETE token when the name trims to empty", () => {
    expect(deleteConfirmTarget("")).toBe(DELETE_CONFIRM_FALLBACK);
    expect(deleteConfirmTarget("   ")).toBe(DELETE_CONFIRM_FALLBACK);
  });
});

describe("deleteConfirmMatches", () => {
  it("compares trimmed on BOTH sides, case-sensitively", () => {
    expect(deleteConfirmMatches("Elandra", "Elandra")).toBe(true);
    expect(deleteConfirmMatches("  Elandra ", "Elandra")).toBe(true);
    expect(deleteConfirmMatches("Elandra", "  Elandra  ")).toBe(true);
    expect(deleteConfirmMatches("elandra", "Elandra")).toBe(false);
    expect(deleteConfirmMatches("Elandras", "Elandra")).toBe(false);
    expect(deleteConfirmMatches("", "Elandra")).toBe(false);
  });

  it("blank stored names accept only the DELETE token — never the empty string", () => {
    expect(deleteConfirmMatches("DELETE", "")).toBe(true);
    expect(deleteConfirmMatches(" DELETE ", "   ")).toBe(true);
    expect(deleteConfirmMatches("delete", "")).toBe(false);
    // The old gate's contradiction: typing "nothing" must NOT delete a blank-named character.
    expect(deleteConfirmMatches("", "")).toBe(false);
    expect(deleteConfirmMatches("   ", "   ")).toBe(false);
  });
});
