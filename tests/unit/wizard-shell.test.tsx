import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import {
  createDefaultCharacter,
  writeWizardMeta,
  resumeStepFor,
  WIZARD_ORDER_VERSION,
  type PathForgeCharacterV1,
  type WizardMeta,
} from "@pathforge/schema";

// CharacterWizard reuses SaveStatusBadge from character-editor.tsx (and the same
// useCharacterEditor hook), which pulls in the same editor chrome CharacterEditor does; jsdom lacks
// a couple of browser APIs that chrome touches. Same preamble as character-editor-layouts.test.tsx.
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

// Mock only the save server action (like the editor tests) — merge/compute run for real.
const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("@/lib/actions/characters", () => ({ saveCharacterSheetAction: saveMock }));

// Browser Supabase client stub: a chainable, thenable no-op query builder — copied verbatim from
// character-editor-layouts.test.tsx's mock preamble (character-editor.tsx creates one at module
// scope, and its pickers query it on open).
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

// The wizard navigates via useRouter().push (the welcome escape hatch, the Finish step) — there's
// no App Router context under jsdom, so next/navigation must be mocked or useRouter() throws.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { CharacterWizard } from "@/components/character/wizard/character-wizard";

// Pump fake timers + the save loop's microtasks until everything settles (same idiom as
// character-editor-layouts.test.tsx / use-character-editor.test.tsx).
async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

function fixture(step: "welcome" | "done" = "welcome"): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: step === "done" ? "Finisher" : "New Hero" });
  writeWizardMeta(c, { active: true, step, startedAt: "2026-07-09T00:00:00.000Z" });
  return c;
}

function lastSavedWizardMeta() {
  const call = saveMock.mock.calls.at(-1);
  const sheet = call?.[1] as PathForgeCharacterV1 | undefined;
  return sheet?.metadata.custom.wizard as
    | { active: boolean; step: string; completedAt?: string }
    | undefined;
}

describe("wizard v2 resume — v1-order checkpoints must not skip the inserted steps", () => {
  const meta = (step: WizardMeta["step"], order?: number): WizardMeta => ({
    active: true,
    step,
    startedAt: "2026-07-09T00:00:00.000Z",
    ...(order != null ? { order } : {}),
  });

  it("a v1 checkpoint (no order stamp) mid-flow resumes at Systems; bookends stay put", () => {
    // v1's order was welcome→race→class→abilities→…; Systems (and often Abilities) now sit
    // BEFORE every non-bookend v1 position, and the shell only walks forward (review finding).
    expect(resumeStepFor(meta("race"))).toBe("systems");
    expect(resumeStepFor(meta("class"))).toBe("systems");
    expect(resumeStepFor(meta("skills"))).toBe("systems");
    expect(resumeStepFor(meta("welcome"))).toBe("welcome");
    expect(resumeStepFor(meta("done"))).toBe("done");
  });

  it("a current-order checkpoint resumes literally, and every write re-stamps the order", () => {
    expect(resumeStepFor(meta("class", WIZARD_ORDER_VERSION))).toBe("class");
    const c = createDefaultCharacter({ name: "Stamp" });
    const written = writeWizardMeta(c, { step: "hp" });
    expect(written.order).toBe(WIZARD_ORDER_VERSION);
    expect(resumeStepFor(written)).toBe("hp");
  });
});

describe("CharacterWizard skeleton — welcome + handoff (S6 Pillar 3, slice W1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
    pushMock.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the welcome step first", async () => {
    render(<CharacterWizard characterId="w1" initial={fixture()} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: /let.?s build your character/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip to the blank editor/i })).toBeInTheDocument();
  });

  it("Next advances to the Systems step and persists metadata.custom.wizard.step='systems'", async () => {
    render(<CharacterWizard characterId="w2" initial={fixture()} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    // Wizard v2 order: welcome → systems ("what does your game use?") → abilities → race → …
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /what does your game use/i })).toBeInTheDocument();

    await settle();
    expect(saveMock).toHaveBeenCalled();
    expect(lastSavedWizardMeta()).toMatchObject({ active: true, step: "systems" });
  });

  it("Back returns to the previous step", async () => {
    render(<CharacterWizard characterId="w3" initial={fixture()} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /what does your game use/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("heading", { name: /let.?s build your character/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /what does your game use/i })).not.toBeInTheDocument();
  });

  it("Skip this step advances without a different persisted shape than Next", async () => {
    render(<CharacterWizard characterId="w3b" initial={fixture()} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    // Welcome has no "Skip this step" button (it's a bookend step); advance to Systems first.
    expect(screen.queryByRole("button", { name: /^skip this step$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^skip this step$/i }));
    // Systems → Abilities under the v2 order.
    expect(screen.getByRole("heading", { name: /set your ability scores/i })).toBeInTheDocument();

    await settle();
    expect(lastSavedWizardMeta()).toMatchObject({ step: "abilities" });
  });

  it("the welcome escape hatch sets wizard.active=false and navigates to the full editor", async () => {
    render(<CharacterWizard characterId="w4" initial={fixture()} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /skip to the blank editor/i }));
    await settle();

    expect(lastSavedWizardMeta()).toMatchObject({ active: false });
    expect(pushMock).toHaveBeenCalledWith("/characters/w4/edit");
  });

  it("resumes at the persisted step, and Finish completes the wizard + hands off to the full editor", async () => {
    render(<CharacterWizard characterId="w5" initial={fixture("done")} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    // Resumed straight into the Handoff summary card — no clicking through the other 7 steps.
    expect(screen.getByRole("heading", { name: /finisher/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^finish/i }));
    await settle();

    const meta = lastSavedWizardMeta();
    expect(meta).toMatchObject({ active: false });
    expect(meta?.completedAt).toBeTruthy();
    expect(pushMock).toHaveBeenCalledWith("/characters/w5/edit");
  });
});
