import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { createDefaultCharacter } from "@pathforge/schema";

// The full CharacterEditor mounts every sub-editor in classic mode; jsdom lacks a couple of
// browser APIs some of that chrome touches.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Mock only the save server action (like the hook test) — merge/compute run for real.
const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("@/lib/actions/characters", () => ({ saveCharacterSheetAction: saveMock }));

// Browser Supabase client stub: a chainable, thenable no-op query builder. Pickers only fetch when
// opened, but this keeps any eager createClient() safe under jsdom.
vi.mock("@/lib/supabase/client", () => {
  function makeQuery(): Record<string, unknown> {
    const q: Record<string, unknown> = {};
    for (const m of [
      "select",
      "eq",
      "neq",
      "in",
      "or",
      "ilike",
      "order",
      "limit",
      "range",
      "textSearch",
      "maybeSingle",
      "single",
      "insert",
      "update",
      "delete",
    ]) {
      q[m] = () => q;
    }
    q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return q;
  }
  return {
    createClient: () => ({
      from: () => makeQuery(),
      rpc: () => makeQuery(),
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    }),
  };
});

import { CharacterEditor } from "@/components/character/editor/character-editor";

// Pump fake timers + the save loop's microtasks until everything settles (same idiom as the
// use-character-editor tests — waitFor polls real timers, which never advance under fake ones).
async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

describe("CharacterEditor — Modern ⇄ Classic layout switch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("both layouts share ONE draft and ONE save loop (edit in classic → visible in modern, single save)", async () => {
    const base = createDefaultCharacter({ name: "Original Name" });
    render(<CharacterEditor characterId="c1" initial={base} initialVersion={1} />);

    // Switch to classic via the layout pill.
    fireEvent.click(screen.getByRole("button", { name: /^classic$/i }));
    expect(screen.getByRole("navigation", { name: /jump to sheet section/i })).toBeInTheDocument();
    // The toggle persists to BOTH keys (global default + per-character override).
    expect(localStorage.getItem("pf:editLayout")).toBe("classic");
    expect(localStorage.getItem("pf:editLayout:c1")).toBe("classic");

    // Edit the character name in the classic Identity zone.
    const nameInput = screen.getByDisplayValue("Original Name");
    fireEvent.change(nameInput, { target: { value: "Classic Edit" } });
    await settle();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenLastCalledWith(
      "c1",
      expect.objectContaining({ identity: expect.objectContaining({ name: "Classic Edit" }) }),
      1,
    );

    // Flip back to modern — the SAME draft is visible (shared `ed`), and no second save fires
    // (one hook instance ⇒ one serialized save loop).
    fireEvent.click(screen.getByRole("button", { name: /^modern$/i }));
    expect(screen.queryByRole("navigation", { name: /jump to sheet section/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Classic Edit")).toBeInTheDocument();
    await settle();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("pf:editLayout")).toBe("modern");
  });

  it("restores a stored classic preference on mount (per-character override wins)", async () => {
    localStorage.setItem("pf:editLayout", "modern");
    localStorage.setItem("pf:editLayout:c2", "classic");
    const base = createDefaultCharacter({ name: "Restore Me" });
    render(<CharacterEditor characterId="c2" initial={base} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("navigation", { name: /jump to sheet section/i })).toBeInTheDocument();
    const classicPill = screen.getByRole("button", { name: /^classic$/i });
    expect(classicPill).toHaveAttribute("aria-pressed", "true");
  });
});
