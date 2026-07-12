import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { createDefaultCharacter, writeLevelUpMeta, type PathForgeCharacterV1 } from "@pathforge/schema";

// Level-Up Wizard Stage 5 — Feats + ASI steps. Harness preamble copied from
// tests/unit/level-up-wrappers.test.tsx / level-up-class-step.test.tsx (useCharacterEditor pulls in
// the editor chrome's jsdom-missing browser APIs + a module-scope Supabase client even though these
// steps don't need real network data — the Feats step's embedded FeatPicker/EntryPicker/DrawbackPicker
// only mount once their "Browse" button is clicked, which none of these tests do; driving `ed.update`
// directly for the "a feat shows up" case avoids needing a heavy, RPC-aware Supabase stub).
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { useCharacterEditor, type CharacterEditorApi } from "@/components/character/editor/use-character-editor";
// Direct imports of the step components ONLY — never level-up-steps.tsx / level-up-wizard.tsx (their
// import graphs are owned by a concurrent agent this session).
import { LevelUpFeatsStep } from "@/components/character/wizard/level-up/feats-step";
import { LevelUpAsiStep } from "@/components/character/wizard/level-up/asi-step";

function Host({
  initial,
  onEd,
  children,
}: {
  initial: PathForgeCharacterV1;
  onEd: (ed: CharacterEditorApi) => void;
  children: (ed: CharacterEditorApi) => ReactNode;
}) {
  const ed = useCharacterEditor("levelup-feats-asi-test", initial, 1);
  useEffect(() => {
    onEd(ed);
  });
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

function fixture({ fromLevel, targetLevel }: { fromLevel: number; targetLevel: number }): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Level-Up Feats/ASI Test" });
  writeLevelUpMeta(c, { active: true, fromLevel, targetLevel, startedAt: "2026-07-12T00:00:00.000Z" });
  return c;
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LevelUpFeatsStep", () => {
  it('shows the owed badge — 3→7 crosses levels 5 and 7, "2" feat picks', async () => {
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 7 })} onEd={() => {}}>
        {(ed) => <LevelUpFeatsStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.getByText(/this level-up grants 2 feat picks/i)).toBeInTheDocument();
  });

  it("hides the owed badge with no active session, never guesses a count", async () => {
    const c = createDefaultCharacter({ name: "No Session" });
    render(
      <Host initial={c} onEd={() => {}}>
        {(ed) => <LevelUpFeatsStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.queryByText(/this level-up grants/i)).not.toBeInTheDocument();
  });

  it("embeds the create wizard's FeatsStep composition (Browse feats + traits pickers, verbatim)", async () => {
    render(
      <Host initial={fixture({ fromLevel: 1, targetLevel: 3 })} onEd={() => {}}>
        {(ed) => <LevelUpFeatsStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.getByRole("heading", { name: /feats, traits & drawbacks/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /browse feats/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /browse traits/i })).toBeInTheDocument();
  });

  it("a feat added via the underlying editor state shows up in the chip list", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixture({ fromLevel: 1, targetLevel: 3 })} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpFeatsStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.getByText(/no feats yet/i)).toBeInTheDocument();

    await act(async () => {
      latestEd!.update((c) => {
        c.feats.list.push({ id: "feat_power_attack", name: "Power Attack", type: "Combat", tags: [], automation: [] });
      });
    });
    await settle();

    expect(screen.getByText("Power Attack")).toBeInTheDocument();
    expect(screen.queryByText(/no feats yet/i)).not.toBeInTheDocument();
  });
});

describe("LevelUpAsiStep", () => {
  it("sessionOwed: 3→7 crosses exactly the level-4 boundary — 1 milestone", async () => {
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 7 })} onEd={() => {}}>
        {(ed) => <LevelUpAsiStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.getByText(/this level-up crosses 1 ability-increase milestone/i)).toBeInTheDocument();
  });

  it("sessionOwed: 4→5 crosses no new boundary — 0 milestones", async () => {
    render(
      <Host initial={fixture({ fromLevel: 4, targetLevel: 5 })} onEd={() => {}}>
        {(ed) => <LevelUpAsiStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.getByText(/this level-up crosses 0 ability-increase milestones/i)).toBeInTheDocument();
  });

  it("Add records the right bookkeeping level: 4 first, then 8", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 8 })} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpAsiStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /add \+1/i }));
    await settle();
    expect(latestEd!.draft.abilities.abilityIncreases).toHaveLength(1);
    expect(latestEd!.draft.abilities.abilityIncreases[0]).toMatchObject({ level: 4, ability: "str" });

    fireEvent.click(screen.getByRole("button", { name: /add \+1/i }));
    await settle();
    expect(latestEd!.draft.abilities.abilityIncreases).toHaveLength(2);
    expect(latestEd!.draft.abilities.abilityIncreases[1]).toMatchObject({ level: 8, ability: "str" });
  });

  it("remove deletes exactly one entry by id (the most recent for that ability)", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 8 })} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpAsiStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /add \+1/i }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /add \+1/i }));
    await settle();
    expect(latestEd!.draft.abilities.abilityIncreases).toHaveLength(2);
    const keptId = latestEd!.draft.abilities.abilityIncreases[0]!.id;

    fireEvent.click(screen.getByRole("button", { name: /remove an ability increase from str/i }));
    await settle();

    expect(latestEd!.draft.abilities.abilityIncreases).toHaveLength(1);
    expect(latestEd!.draft.abilities.abilityIncreases[0]!.id).toBe(keptId);
  });

  it("warns (never blocks) when more increases are recorded than the formula owes", async () => {
    const c = fixture({ fromLevel: 1, targetLevel: 4 }); // totalOwed = 1
    c.abilities.abilityIncreases = [
      { id: "asi_1", level: 4, ability: "str" },
      { id: "asi_2", level: 4, ability: "dex" },
    ]; // recorded = 2 > totalOwed = 1
    render(
      <Host initial={c} onEd={() => {}}>
        {(ed) => <LevelUpAsiStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.getByText(/more increases recorded than levels 4\/8\/12\/16\/20/i)).toBeInTheDocument();
    // Advisory only — the Add control is never disabled by the over-cap state.
    expect(screen.getByRole("button", { name: /add \+1/i })).toBeEnabled();
  });

  it("the +1 lands in the computed effective score right after Add", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 4 })} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpAsiStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();
    expect(latestEd!.computed.abilities.str!.effectiveScore).toBe(10);

    // Default select value is "str" (LevelUpAsiStep's initial useState).
    fireEvent.click(screen.getByRole("button", { name: /add \+1/i }));
    await settle();

    expect(latestEd!.computed.abilities.str!.effectiveScore).toBe(11);
  });
});
