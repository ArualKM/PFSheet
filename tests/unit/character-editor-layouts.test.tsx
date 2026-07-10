import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { formatModifier } from "@/lib/utils";

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

describe("CharacterEditor — Modern editor canvas (S6 Pillar 2 Stage 2 chip summaries)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // Summary-card buttons are accessibly named "Open <label>" (aria-label — without it the name
  // would concatenate the entire live chip row; a Stage 2 review finding). Chip assertions match a
  // chip SPAN's deep textContent ("<LABEL><value>") — filtering to spans keeps a single-chip card
  // from also matching the chip row's wrapper div with the same textContent.
  const chipIn = (card: HTMLElement, text: string) =>
    within(card).getByText(
      (_content, element) => element?.tagName === "SPAN" && element?.textContent === text,
    );

  it("inactive sections render a live chip-summary card; the active section renders none", async () => {
    const base = createDefaultCharacter({ name: "Summary Test" });
    render(<CharacterEditor characterId="sc1" initial={base} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    // "Core" is the default active section — it renders the full tabpanel (with an inert header,
    // not a button), so there is no "Open Core" summary button.
    expect(screen.queryByRole("button", { name: /^open core$/i })).not.toBeInTheDocument();

    // Every other top-level section collapses to a summary-card button.
    expect(screen.getByRole("button", { name: /^open defenses$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^open attacks$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^open skills$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^open equipment$/i })).toBeInTheDocument();
  });

  it("clicking a collapsed section's summary card expands it in place and moves focus to the panel", async () => {
    const base = createDefaultCharacter({ name: "Expand Test" });
    render(<CharacterEditor characterId="sc2" initial={base} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /^open skills$/i }));

    // The Skills editor is now the active tabpanel (its desktop table has a "Skill" column).
    expect(screen.getByRole("columnheader", { name: "Skill" })).toBeInTheDocument();
    // Skills is the active section now, so it no longer renders its OWN summary card...
    expect(screen.queryByRole("button", { name: /^open skills$/i })).not.toBeInTheDocument();
    // ...while Core (now inactive) has grown one.
    expect(screen.getByRole("button", { name: /^open core$/i })).toBeInTheDocument();

    // The jump moves focus to the tabpanel (a review finding: the clicked summary card unmounts,
    // which would otherwise drop keyboard/SR focus to <body>). The focus call rides an rAF.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(document.activeElement?.id).toBe("editor-panel");
  });

  it("the defenses summary card shows the LIVE computed AC/Fort values", async () => {
    const base = createDefaultCharacter({ name: "AC Test" });
    const computed = computeCharacter(base);
    render(<CharacterEditor characterId="sc3" initial={base} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    const defensesCard = screen.getByRole("button", { name: /^open defenses$/i });
    expect(chipIn(defensesCard, `AC${computed.summary.ac}`)).toBeInTheDocument();
    expect(chipIn(defensesCard, `Fort${formatModifier(computed.summary.fortitude)}`)).toBeInTheDocument();
  });

  it("the core chip shows Vigor/Wounds (not the frozen classic HP) when Wounds & Vigor is enabled", async () => {
    const base = createDefaultCharacter({ name: "WV Test" });
    base.rules.variants.woundsVigor = true;
    const wv = computeCharacter(base).summary.woundsVigor!;
    render(<CharacterEditor characterId="sc4" initial={base} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    // Collapse Core by activating another section, then read Core's summary card.
    fireEvent.click(screen.getByRole("button", { name: /^open defenses$/i }));
    const coreCard = screen.getByRole("button", { name: /^open core$/i });
    expect(chipIn(coreCard, `Vigor${wv.vigor.current}/${wv.vigor.max}`)).toBeInTheDocument();
    expect(chipIn(coreCard, `Wounds${wv.wound.current}/${wv.wound.max}`)).toBeInTheDocument();
    // The classic HP chip must NOT render — summary.hp is the untouched 0/0 classic pool here.
    expect(within(coreCard).queryByText(
      (_content, element) => element?.tagName === "SPAN" && /^HP\d/.test(element?.textContent ?? ""),
    )).not.toBeInTheDocument();
  });

  it("the equipment chip shows converted TOTAL wealth, not just the gp coin count", async () => {
    const base = createDefaultCharacter({ name: "Wealth Test" });
    base.wealth.pp = 100; // worth 1000 gp — a gp-coins-only read would show 0
    base.wealth.gp = 0;
    render(<CharacterEditor characterId="sc5" initial={base} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    const equipCard = screen.getByRole("button", { name: /^open equipment$/i });
    expect(chipIn(equipCard, "GP≈1000")).toBeInTheDocument();
  });
});

function familiarFixture(name: string) {
  const c = createDefaultCharacter({ name });
  c.companion = { type: "familiar" };
  return c;
}

describe("CharacterEditor — companion Simple layout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a companion character defaults to Companion Simple; a non-companion character still defaults to Modern", async () => {
    render(<CharacterEditor characterId="comp1" initial={familiarFixture("Whiskers")} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    // The Companion Simple layout is showing: the Advanced escape hatches (top + bottom) and the
    // open-by-default Companion Link zone header are present, and the layout pill has Companion
    // pressed. (The zone is named "Companion Link" so the pill's "Companion" name stays unique.)
    expect(screen.getAllByRole("button", { name: /open the advanced editor/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^companion link$/i, expanded: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^companion$/i, pressed: true })).toBeInTheDocument();
    // No section rail to navigate to on a single-scroll layout — the mobile hamburger is hidden.
    expect(screen.queryByRole("button", { name: /^sheet sections/i })).not.toBeInTheDocument();

    cleanup();

    render(<CharacterEditor characterId="pc1" initial={createDefaultCharacter({ name: "Aria" })} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /open the advanced editor/i })).not.toBeInTheDocument();
    // No companion view for a PC — the pill doesn't offer it, and there's no Companion zone.
    expect(screen.queryByRole("button", { name: /^companion$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^modern$/i, pressed: true })).toBeInTheDocument();
  });

  it("the layout pill offers 3 options (Companion/Modern/Classic) for a companion character, 2 for a PC", async () => {
    render(<CharacterEditor characterId="comp2" initial={familiarFixture("Whiskers")} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    const pill = screen.getByRole("group", { name: /editor layout/i });
    expect(within(pill).getAllByRole("button")).toHaveLength(3);
    expect(within(pill).getByRole("button", { name: /^companion$/i })).toBeInTheDocument();
    expect(within(pill).getByRole("button", { name: /^modern$/i })).toBeInTheDocument();
    expect(within(pill).getByRole("button", { name: /^classic$/i })).toBeInTheDocument();

    cleanup();

    render(<CharacterEditor characterId="pc2" initial={createDefaultCharacter({ name: "Aria" })} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    const pcPill = screen.getByRole("group", { name: /editor layout/i });
    expect(within(pcPill).getAllByRole("button")).toHaveLength(2);
  });

  it("'Open the Advanced editor' switches to Modern IN PLACE, and Companion⇄Modern share the SAME draft (one save loop)", async () => {
    render(<CharacterEditor characterId="comp3" initial={familiarFixture("Whiskers")} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: /^companion$/i, pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /open the advanced editor/i })[0]!);

    // Modern chrome now shows: its layout pill is pressed and its section rail tablist is present.
    expect(screen.getByRole("button", { name: /^modern$/i, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: /sheet sections/i })).toBeInTheDocument();

    // Edit the character name in Modern (Identity is the default sub-tab).
    const nameInput = screen.getByDisplayValue("Whiskers");
    fireEvent.change(nameInput, { target: { value: "Whiskers Edited" } });
    await settle();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenLastCalledWith(
      "comp3",
      expect.objectContaining({ identity: expect.objectContaining({ name: "Whiskers Edited" }) }),
      1,
    );

    // Flip BACK to Companion via the pill — same `ed`, no re-fetch, no second save.
    fireEvent.click(screen.getByRole("button", { name: /^companion$/i, pressed: false }));
    expect(screen.getByRole("button", { name: /^companion$/i, pressed: true })).toBeInTheDocument();

    // Identity & Details is collapsed by default in Companion Simple — open it to reach the field.
    fireEvent.click(screen.getByRole("button", { name: /^identity & details$/i, expanded: false }));
    expect(screen.getByDisplayValue("Whiskers Edited")).toBeInTheDocument();
    await settle();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("persistence: per-character key beats the companion auto-default; the global key never does; choosing Companion writes only the per-char key", async () => {
    localStorage.setItem("pf:editLayout:comp4", "modern");
    render(<CharacterEditor characterId="comp4" initial={familiarFixture("Whiskers")} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    // The stored per-character "modern" beats the companion auto-default.
    expect(screen.getByRole("button", { name: /^modern$/i, pressed: true })).toBeInTheDocument();

    cleanup();
    localStorage.clear();
    localStorage.setItem("pf:editLayout", "classic");
    render(<CharacterEditor characterId="comp5" initial={familiarFixture("Whiskers II")} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    // A global modern/classic choice made while editing an unrelated PC must never beat the
    // companion auto-default.
    expect(screen.getByRole("button", { name: /^companion$/i, pressed: true })).toBeInTheDocument();

    // Choosing Classic writes BOTH keys (unchanged contract for modern/classic)...
    fireEvent.click(screen.getByRole("button", { name: /^classic$/i }));
    expect(localStorage.getItem("pf:editLayout:comp5")).toBe("classic");
    expect(localStorage.getItem("pf:editLayout")).toBe("classic");

    // ...but choosing Companion writes ONLY the per-character key, leaving the global default alone.
    // (Classic's companion zone header is named "Companion Link", so /^companion$/ is the pill.)
    fireEvent.click(screen.getByRole("button", { name: /^companion$/i, pressed: false }));
    expect(localStorage.getItem("pf:editLayout:comp5")).toBe("companion");
    expect(localStorage.getItem("pf:editLayout")).toBe("classic");
  });

  it("the Advanced escape hatches are locked during a sync conflict (protects in-progress resolver choices)", async () => {
    const base = familiarFixture("Whiskers");
    render(<CharacterEditor characterId="comp6" initial={base} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    // The server holds a competing edit to the SAME field → threeWayMerge reports a true collision
    // and the hook enters status "conflict".
    const serverSheet = structuredClone(base);
    serverSheet.identity.name = "Server Edit";
    saveMock.mockResolvedValue({ conflict: { serverSheet, serverVersion: 2 } });

    // Identity & Details is collapsed by default in Companion Simple — open it to reach the field.
    fireEvent.click(screen.getByRole("button", { name: /^identity & details$/i, expanded: false }));
    fireEvent.change(screen.getByDisplayValue("Whiskers"), { target: { value: "Mine Edit" } });
    await settle();

    // Every layout-switch affordance is locked — switching would remount ConflictResolver and
    // silently drop its in-progress per-field choices.
    expect(screen.getByRole("button", { name: /^modern$/i })).toBeDisabled();
    const hatches = screen.getAllByRole("button", { name: /open the advanced editor/i });
    expect(hatches.length).toBeGreaterThan(0);
    for (const hatch of hatches) {
      expect(hatch).toBeDisabled();
    }
  });
});
