import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { createDefaultCharacter, writeLevelUpMeta, type PathForgeCharacterV1 } from "@pathforge/schema";

// Level-Up Wizard Stage 3 — the Class step + the ClassCompendiumPicker prefill fix. Harness preamble
// copied from tests/unit/wizard-steps.test.tsx (these steps render real editor pickers, which touch
// jsdom-missing browser APIs and a Supabase client at module scope), with one addition: the Supabase
// stub is now TABLE/RPC-AWARE so `select()` can actually resolve a "Fighter" row — proving the
// prefill fix (deliverable F(3): selecting an owned class must never show a stale lower level).
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

const FIGHTER_ROW = {
  slug: "fighter",
  name: "Fighter",
  hit_die: "d10",
  class_skills: null,
  skill_points_per_level: "2",
  role: null,
  source: null,
};

vi.mock("@/lib/supabase/client", () => {
  function makeQuery(response: { data: unknown; error: unknown } = { data: [], error: null }): Record<string, unknown> {
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
    q.then = (resolve: (v: unknown) => void) => resolve(response);
    return q;
  }
  return {
    createClient: () => ({
      from: (table: string) => {
        // class_progression: no progression JSON — apply() still requires a truthy `progression` to
        // enable, but the Level field renders regardless (parseProgression(null) still returns a
        // valid, warned object) — exactly what these tests need to observe the prefill.
        if (table === "class_progression") return makeQuery({ data: null, error: null });
        return makeQuery();
      },
      rpc: (fn: string) => {
        if (fn === "search_class_compendium") return makeQuery({ data: [FIGHTER_ROW], error: null });
        return makeQuery();
      },
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
import { ClassCompendiumPicker } from "@/components/character/editor/class-compendium-picker";
import { LevelUpClassStep, canAdvanceLevelUpClass } from "@/components/character/wizard/level-up/class-step";

/** Mounts a real `useCharacterEditor` and hands the live `ed` to a render-prop child — same shape as
 *  wizard-steps.test.tsx's Host. */
function Host({
  initial,
  onEd,
  children,
}: {
  initial: PathForgeCharacterV1;
  onEd: (ed: CharacterEditorApi) => void;
  children: (ed: CharacterEditorApi) => ReactNode;
}) {
  const ed = useCharacterEditor("levelup-class-test", initial, 1);
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

function fixture({ fromLevel = 3, targetLevel = 4 }: { fromLevel?: number; targetLevel?: number } = {}): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Level-Up Test" });
  c.identity.classes.push({ id: "cls_fighter", name: "Fighter", level: fromLevel, presetKey: "fighter" });
  c.identity.totalLevel = fromLevel;
  writeLevelUpMeta(c, { active: true, fromLevel, targetLevel, startedAt: "2026-07-12T00:00:00.000Z" });
  return c;
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

describe("canAdvanceLevelUpClass", () => {
  it("is false when there's no active level-up session", () => {
    const c = createDefaultCharacter({ name: "No session" });
    expect(canAdvanceLevelUpClass({ draft: c } as unknown as CharacterEditorApi)).toBe(false);
  });

  it("is false until totalLevel reaches targetLevel, true once it does", () => {
    const c = fixture({ fromLevel: 3, targetLevel: 4 });
    expect(canAdvanceLevelUpClass({ draft: c } as unknown as CharacterEditorApi)).toBe(false);

    c.identity.classes[0]!.level = 4;
    c.identity.totalLevel = 4;
    expect(canAdvanceLevelUpClass({ draft: c } as unknown as CharacterEditorApi)).toBe(true);
  });

  it("gestalt: requires BOTH tracks to independently reach targetLevel, not just one", () => {
    const c = createDefaultCharacter({ name: "Gestalt Test" });
    c.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
    c.identity.classes.push({ id: "cls_a", name: "Fighter", level: 4, presetKey: "fighter", track: "a" });
    c.identity.classes.push({ id: "cls_b", name: "Rogue", level: 3, presetKey: "rogue", track: "b" });
    c.identity.totalLevel = 4;
    writeLevelUpMeta(c, { active: true, fromLevel: 3, targetLevel: 4, startedAt: "2026-07-12T00:00:00.000Z" });

    // Track A is already at 4, but track B is only at 3 — must not advance on track A alone.
    expect(canAdvanceLevelUpClass({ draft: c } as unknown as CharacterEditorApi)).toBe(false);

    c.identity.classes[1]!.level = 4;
    expect(canAdvanceLevelUpClass({ draft: c } as unknown as CharacterEditorApi)).toBe(true);
  });
});

describe("LevelUpClassStep", () => {
  it('renders "Level {fromLevel} → {targetLevel}"', async () => {
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 4 })} onEd={() => {}}>
        {(ed) => <LevelUpClassStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();
    expect(screen.getByRole("heading", { name: "Level 3 → 4" })).toBeInTheDocument();
  });

  it("the +1 level button raises the class level and totalLevel in one ed.update", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 4 })} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpClassStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /raise fighter by one level/i }));
    await settle();

    expect(latestEd!.draft.identity.classes[0]!.level).toBe(4);
    expect(latestEd!.draft.identity.totalLevel).toBe(4);
    // The gate is now satisfied.
    expect(canAdvanceLevelUpClass(latestEd!)).toBe(true);
    // The +1 button disables itself once nothing remains to assign.
    expect(screen.getByRole("button", { name: /raise fighter by one level/i })).toBeDisabled();
  });

  it("the −1 button undoes a level, never going below 1", async () => {
    let latestEd: CharacterEditorApi | undefined;
    const c = fixture({ fromLevel: 1, targetLevel: 2 });
    render(
      <Host initial={c} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpClassStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    // Starting at level 1 — the ghost "−1" button is disabled (never below 1).
    expect(screen.getByRole("button", { name: /lower fighter by one level/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /raise fighter by one level/i }));
    await settle();
    expect(latestEd!.draft.identity.classes[0]!.level).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /lower fighter by one level/i }));
    await settle();
    expect(latestEd!.draft.identity.classes[0]!.level).toBe(1);
    expect(latestEd!.draft.identity.totalLevel).toBe(1);
  });

  it("the −1 button floors at the class's SESSION-START level, not 1 (review C6)", async () => {
    // With startingClasses snapshotted (Stage 7's startLevelUpAction stamps it), −1 must never
    // erase levels the class had before this session opened — only undo THIS session's bumps.
    let latestEd: CharacterEditorApi | undefined;
    const c = fixture({ fromLevel: 3, targetLevel: 5 });
    writeLevelUpMeta(c, { startingClasses: [{ id: "cls_fighter", name: "Fighter", level: 3 }] });
    render(
      <Host initial={c} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpClassStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    // At the session-start level already — nothing to undo.
    expect(screen.getByRole("button", { name: /lower fighter by one level/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /raise fighter by one level/i }));
    await settle();
    expect(latestEd!.draft.identity.classes[0]!.level).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: /lower fighter by one level/i }));
    await settle();
    expect(latestEd!.draft.identity.classes[0]!.level).toBe(3);
    // Back at the floor — disabled again; pre-session levels are untouchable from here.
    expect(screen.getByRole("button", { name: /lower fighter by one level/i })).toBeDisabled();
  });

  it("raising the target-level stepper writes meta.targetLevel via ed.update", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixture({ fromLevel: 3, targetLevel: 4 })} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <LevelUpClassStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    const stepper = screen.getByLabelText("Target level");
    fireEvent.change(stepper, { target: { value: "7" } });
    await settle();

    expect(latestEd!.draft.metadata.custom.levelUp).toMatchObject({ targetLevel: 7, fromLevel: 3 });
    expect(screen.getByRole("heading", { name: "Level 3 → 7" })).toBeInTheDocument();
  });

  it("a synced familiar renders a read-only explanation instead of the leveling UI", async () => {
    const c = fixture({ fromLevel: 3, targetLevel: 4 });
    // synced === true requires syncEnabled + a resolved master cache (compute.ts: `linked =
    // isFamiliar && comp.syncEnabled && m`) — a bare `{ type: "familiar", syncEnabled: true }` with
    // no master cache would NOT trip this guard, so the fixture supplies one.
    c.companion = {
      type: "familiar",
      syncEnabled: true,
      master: { characterId: "master1", name: "Hero", level: 5, bab: 3, hpMax: 40, saves: { fortitude: 4, reflex: 4, will: 1 }, skillRanks: {} },
    };
    render(
      <Host initial={c} onEd={() => {}}>
        {(ed) => <LevelUpClassStep ed={ed} characterId="c1" />}
      </Host>,
    );
    await settle();

    expect(screen.getByText(/track its master automatically/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Level 3/ })).not.toBeInTheDocument();
  });
});

describe("ClassCompendiumPicker prefillLevel (Stage 3 must-fix)", () => {
  it("seeds the Level field from prefillLevel's result after selecting a row — never the stale default", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={createDefaultCharacter({ name: "Prefill Test" })} onEd={(ed) => (latestEd = ed)}>
        {(ed) => (
          <ClassCompendiumPicker ed={ed} onClose={() => {}} autoFocusSearch={false} resetAfterApply prefillLevel={() => 7} />
        )}
      </Host>,
    );
    await settle();
    expect(latestEd).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Select Fighter" }));
    await settle();

    expect(screen.getByLabelText("Level")).toHaveValue(7);
  });

  it("without prefillLevel, the Level field keeps its default (today's unchanged behavior)", async () => {
    render(
      <Host initial={createDefaultCharacter({ name: "No Prefill" })} onEd={() => {}}>
        {(ed) => <ClassCompendiumPicker ed={ed} onClose={() => {}} autoFocusSearch={false} />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Select Fighter" }));
    await settle();

    expect(screen.getByLabelText("Level")).toHaveValue(1);
  });
});
