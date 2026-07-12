import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { createDefaultCharacter, writeLevelUpMeta, type PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * Level-Up Wizard Stage 7 — the Review/Finish step. Imports `review-step.tsx` DIRECTLY (never
 * `level-up-steps.tsx`/`level-up-wizard.tsx`, whose import graphs are owned by a concurrent agent
 * upgrading the sibling feats/asi/spells steps in place) — same isolation discipline as
 * `level-up-wrappers.test.tsx`. The "Anything else?" disclosure DOES render those sibling components
 * once expanded, so this file deliberately tests that section shallowly (buttons toggle, only one
 * panel open at a time) rather than asserting anything about the sibling components' own content,
 * per the Stage 7 brief.
 *
 * Harness preamble copied from `level-up-wrappers.test.tsx` / `wizard-shell.test.tsx` —
 * `useCharacterEditor` pulls in the editor chrome's jsdom-missing browser APIs + a module-scope
 * Supabase client even though this step doesn't query one directly (its "Anything else?" siblings may).
 */
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

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("@/lib/actions/characters", () => ({ saveCharacterSheetAction: saveMock }));

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

import { useCharacterEditor, type CharacterEditorApi } from "@/components/character/editor/use-character-editor";
import { LevelUpReviewStep } from "@/components/character/wizard/level-up/review-step";

function Host({
  initial,
  children,
}: {
  initial: PathForgeCharacterV1;
  children: (ed: CharacterEditorApi) => ReactNode;
}) {
  const ed = useCharacterEditor("levelup-review-test", initial, 1);
  return <>{children(ed)}</>;
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

function lastSavedLevelUpMeta() {
  const call = saveMock.mock.calls.at(-1);
  const sheet = call?.[1] as PathForgeCharacterV1 | undefined;
  return sheet?.metadata.custom.levelUp as { active: boolean; completedAt?: string } | undefined;
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
  pushMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function fixtureWithGains(): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Review Test" });
  // A class present in the starting snapshot (leveled 5 → 6) and one added THIS session
  // (no snapshot entry — a mid-session multiclass, must read as "new", never "0 → 1").
  c.identity.classes.push({ id: "cls_fighter", name: "Fighter", level: 6, presetKey: "fighter" });
  c.identity.classes.push({ id: "cls_rogue", name: "Rogue", level: 1, presetKey: "rogue" });
  c.identity.totalLevel = 7;
  writeLevelUpMeta(c, {
    active: true,
    step: "review",
    fromLevel: 5,
    targetLevel: 7,
    startingMaxHp: 40,
    startingClasses: [{ id: "cls_fighter", name: "Fighter", level: 5 }],
    startedAt: "2026-07-12T00:00:00.000Z",
  });
  return c;
}

describe("LevelUpReviewStep — before/after summary", () => {
  it("shows the Level chip and per-class before/after, labeling a session-new class as 'new'", async () => {
    render(<Host initial={fixtureWithGains()}>{(ed) => <LevelUpReviewStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    expect(screen.getByRole("heading", { name: /review your level-up/i })).toBeInTheDocument();
    expect(screen.getByText(/5 → 7/)).toBeInTheDocument(); // Level chip
    expect(screen.getByText(/5 → 6/)).toBeInTheDocument(); // Fighter: leveled from the snapshot
    expect(screen.getByText(/new · 1/)).toBeInTheDocument(); // Rogue: no snapshot entry
  });

  it("shows the Max HP before/after delta when meta.startingMaxHp is present", async () => {
    render(<Host initial={fixtureWithGains()}>{(ed) => <LevelUpReviewStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    expect(screen.getByText(/40 →/)).toBeInTheDocument();
  });

  it("omits the Max HP chip when meta.startingMaxHp is absent — never guesses a baseline", async () => {
    const c = createDefaultCharacter({ name: "No HP Baseline" });
    writeLevelUpMeta(c, { active: true, step: "review", fromLevel: 1, targetLevel: 2, startedAt: "2026-07-12T00:00:00.000Z" });

    render(<Host initial={c}>{(ed) => <LevelUpReviewStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    expect(screen.queryByText("Max HP")).not.toBeInTheDocument();
  });

  it("renders the engine-computed current-value chips (BAB/saves/Init) — no manual step for them", async () => {
    render(<Host initial={fixtureWithGains()}>{(ed) => <LevelUpReviewStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    for (const label of ["HP", "AC", "Fort", "Ref", "Will", "BAB", "Init"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("LevelUpReviewStep — 'Anything else?' disclosure", () => {
  it("opens exactly one of the three panels at a time (tested shallowly — siblings are volatile)", async () => {
    render(<Host initial={fixtureWithGains()}>{(ed) => <LevelUpReviewStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    // The outer CollapsibleGroup itself starts closed — its buttons aren't in the DOM yet.
    expect(screen.queryByRole("button", { name: /^add a feat$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /anything else/i }));

    const featBtn = screen.getByRole("button", { name: /^add a feat$/i });
    const asiBtn = screen.getByRole("button", { name: /^increase an ability score$/i });
    const spellBtn = screen.getByRole("button", { name: /^manage spells$/i });
    expect(featBtn).toHaveAttribute("aria-expanded", "false");
    expect(asiBtn).toHaveAttribute("aria-expanded", "false");
    expect(spellBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(featBtn);
    expect(featBtn).toHaveAttribute("aria-expanded", "true");
    expect(asiBtn).toHaveAttribute("aria-expanded", "false");

    // Switching to a different panel closes the first — never two open together.
    fireEvent.click(asiBtn);
    expect(featBtn).toHaveAttribute("aria-expanded", "false");
    expect(asiBtn).toHaveAttribute("aria-expanded", "true");
    expect(spellBtn).toHaveAttribute("aria-expanded", "false");

    // Clicking the open panel's own button again collapses it.
    fireEvent.click(asiBtn);
    expect(asiBtn).toHaveAttribute("aria-expanded", "false");
  });
});

describe("LevelUpReviewStep — Finish (handoff-step.tsx's navigation-wait mechanic, mirrored)", () => {
  it("flips active:false + stamps completedAt, and navigates to the overview once the save settles", async () => {
    render(<Host initial={fixtureWithGains()}>{(ed) => <LevelUpReviewStep ed={ed} characterId="char-9" />}</Host>);
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /^finish level-up$/i }));
    await settle();

    const meta = lastSavedLevelUpMeta();
    expect(meta?.active).toBe(false);
    expect(meta?.completedAt).toBeTruthy();
    // Lands on the character OVERVIEW, not /edit (unlike the create wizard's handoff) — the player
    // just leveled up; the sheet itself is the payoff.
    expect(pushMock).toHaveBeenCalledWith("/characters/char-9");
  });

  it("HOLDS navigation on a true same-field conflict (never strands the unsaved merge)", async () => {
    const base = fixtureWithGains();
    // Simulate another tab/device ALSO finishing this level-up concurrently, with a different
    // completedAt — both sides diverge from base (which has no completedAt at all), and diverge
    // from EACH OTHER, which is exactly the "genuine same-field conflict" shape
    // use-character-editor.test.tsx's own conflict test uses (there: identity.name).
    const serverSheet = structuredClone(base);
    writeLevelUpMeta(serverSheet, { active: false, completedAt: "2099-12-31T00:00:00.000Z" });
    saveMock.mockResolvedValueOnce({ ok: false, conflict: { serverSheet, serverVersion: 9 } });

    render(<Host initial={base}>{(ed) => <LevelUpReviewStep ed={ed} characterId="char-conflict" />}</Host>);
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /^finish level-up$/i }));
    await settle();

    // No fallback timer fires on a conflict — navigation is held indefinitely, unlike the "error"
    // status (which still falls back after 4s). levelUp.active stays true on the server either way,
    // so the next /level-up visit would resume cleanly.
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });
});
