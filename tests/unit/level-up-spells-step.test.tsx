import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { createDefaultCharacter, writeLevelUpMeta, type PathForgeCharacterV1 } from "@pathforge/schema";

// Level-Up Wizard Stage 6 — the Spells step. Harness preamble copied from
// tests/unit/level-up-wrappers.test.tsx (useCharacterEditor pulls in the editor chrome's
// jsdom-missing browser APIs + a module-scope Supabase client even for a step that never opens its
// picker in these tests).
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
// Direct import of the step component ONLY — never level-up-steps.tsx / level-up-wizard.tsx.
import { LevelUpSpellsStep } from "@/components/character/wizard/level-up/spells-step";

function Host({ initial, children }: { initial: PathForgeCharacterV1; children: (ed: CharacterEditorApi) => ReactNode }) {
  const ed = useCharacterEditor("levelup-spells-test", initial, 1);
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

function pushCaster(c: PathForgeCharacterV1, opts: { id: string; className: string; casterLevel: number; presetKey?: string }) {
  c.spellcasting.casters.push({
    id: opts.id,
    className: opts.className,
    presetKey: opts.presetKey,
    casterType: "prepared",
    casterLevel: opts.casterLevel,
    concentrationFormula: "",
    castingAbility: "int",
    conditionalModifiers: [],
    spellsPerDay: {},
    bonusSpells: {},
    saveDcFormula: "",
    autoSlots: false,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LevelUpSpellsStep — no casters", () => {
  it("renders a short explainer instead of crashing when there are no casting classes", async () => {
    const c = createDefaultCharacter({ name: "Non-caster" });
    writeLevelUpMeta(c, { active: true, fromLevel: 1, targetLevel: 2, startedAt: "2026-07-12T00:00:00.000Z" });

    render(<Host initial={c}>{(ed) => <LevelUpSpellsStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    expect(screen.getByRole("heading", { name: "Spells" })).toBeInTheDocument();
    expect(screen.getByText(/no casting classes/i)).toBeInTheDocument();
    // No caster chip, no "Browse spells" affordance for a character with nothing to pick.
    expect(screen.queryByRole("button", { name: /browse spells/i })).not.toBeInTheDocument();
  });
});

describe("LevelUpSpellsStep — with a caster", () => {
  it("renders a per-caster chip with the real class name and caster level", async () => {
    const c = createDefaultCharacter({ name: "Caster Test" });
    pushCaster(c, { id: "caster1", className: "Wizard", casterLevel: 5, presetKey: "wizard" });
    writeLevelUpMeta(c, { active: true, fromLevel: 4, targetLevel: 5, startedAt: "2026-07-12T00:00:00.000Z" });

    render(<Host initial={c}>{(ed) => <LevelUpSpellsStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    expect(screen.getByText("Wizard")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // the CL StatChip's value
    expect(screen.getByRole("button", { name: /browse spells/i })).toBeInTheDocument();
  });

  it("highlights a caster added THIS session (absent from meta.startingClasses)", async () => {
    const c = createDefaultCharacter({ name: "New Caster Test" });
    c.identity.classes.push({ id: "cls_wizard", name: "Wizard", level: 1, presetKey: "wizard" });
    pushCaster(c, { id: "caster1", className: "Wizard", casterLevel: 1, presetKey: "wizard" });
    writeLevelUpMeta(c, {
      active: true,
      fromLevel: 3,
      targetLevel: 4,
      startedAt: "2026-07-12T00:00:00.000Z",
      // The snapshot has a DIFFERENT class only — cls_wizard was multiclassed in THIS session.
      startingClasses: [{ id: "cls_fighter", name: "Fighter", level: 3 }],
    });

    render(<Host initial={c}>{(ed) => <LevelUpSpellsStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    expect(screen.getByText(/new caster this level-up/i)).toBeInTheDocument();
  });

  it("omits the highlight when meta.startingClasses is absent — never guesses a baseline", async () => {
    const c = createDefaultCharacter({ name: "No Baseline Test" });
    c.identity.classes.push({ id: "cls_wizard", name: "Wizard", level: 1, presetKey: "wizard" });
    pushCaster(c, { id: "caster1", className: "Wizard", casterLevel: 1, presetKey: "wizard" });
    writeLevelUpMeta(c, { active: true, fromLevel: 3, targetLevel: 4, startedAt: "2026-07-12T00:00:00.000Z" });

    render(<Host initial={c}>{(ed) => <LevelUpSpellsStep ed={ed} characterId="c1" />}</Host>);
    await settle();

    expect(screen.queryByText(/new caster this level-up/i)).not.toBeInTheDocument();
  });
});
