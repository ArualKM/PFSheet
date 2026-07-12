import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { type ReactNode } from "react";
import { createDefaultCharacter, writeLevelUpMeta, type PathForgeCharacterV1 } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

// Level-Up Wizard Stage 4 (HP/Skills wrapper delta banners) + the level-up-steps.tsx registry
// visibility table. Harness preamble copied from tests/unit/wizard-shell-visibility.test.tsx â€”
// useCharacterEditor pulls in the editor chrome's jsdom-missing browser APIs + a module-scope
// Supabase client even though these wrapper components don't render a picker themselves.
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
import { LevelUpHpStep } from "@/components/character/wizard/level-up/hp-step";
import { LevelUpSkillsStep } from "@/components/character/wizard/level-up/skills-step";
import { LEVEL_UP_STEPS } from "@/components/character/wizard/level-up/level-up-steps";

function Host({
  initial,
  children,
}: {
  initial: PathForgeCharacterV1;
  children: (ed: CharacterEditorApi) => ReactNode;
}) {
  const ed = useCharacterEditor("levelup-wrappers-test", initial, 1);
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

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LevelUpHpStep â€” the +N HP delta banner", () => {
  it("shows a delta banner when meta.startingMaxHp is set", async () => {
    const c = createDefaultCharacter({ name: "HP Test" });
    c.identity.classes.push({ id: "cls_fighter", name: "Fighter", level: 4, presetKey: "fighter" });
    c.identity.totalLevel = 4;
    writeLevelUpMeta(c, { active: true, fromLevel: 3, targetLevel: 4, startingMaxHp: 10, startedAt: "2026-07-12T00:00:00.000Z" });

    render(
      <Host initial={c}>{(ed) => <LevelUpHpStep ed={ed} characterId="c1" />}</Host>,
    );
    await settle();

    expect(screen.getByText(/this level-up/i)).toBeInTheDocument();
  });

  it("hides the delta banner when meta.startingMaxHp is absent â€” never guesses a baseline", async () => {
    const c = createDefaultCharacter({ name: "HP Test 2" });
    c.identity.classes.push({ id: "cls_fighter", name: "Fighter", level: 4, presetKey: "fighter" });
    c.identity.totalLevel = 4;
    writeLevelUpMeta(c, { active: true, fromLevel: 3, targetLevel: 4, startedAt: "2026-07-12T00:00:00.000Z" });

    render(
      <Host initial={c}>{(ed) => <LevelUpHpStep ed={ed} characterId="c1" />}</Host>,
    );
    await settle();

    expect(screen.queryByText(/this level-up/i)).not.toBeInTheDocument();
    // The underlying HpStep still renders, with level-up copy.
    expect(screen.getByRole("heading", { name: "Level-up hit points" })).toBeInTheDocument();
  });
});

describe("LevelUpSkillsStep â€” the new-ranks advisory banner", () => {
  it("shows a new-ranks banner when meta.startingClasses records a level gain", async () => {
    const c = createDefaultCharacter({ name: "Skills Test" });
    c.identity.classes.push({ id: "cls_rogue", name: "Rogue", level: 4, presetKey: "rogue" });
    c.identity.totalLevel = 4;
    writeLevelUpMeta(c, {
      active: true,
      fromLevel: 3,
      targetLevel: 4,
      startedAt: "2026-07-12T00:00:00.000Z",
      startingClasses: [{ id: "cls_rogue", name: "Rogue", level: 3 }],
    });

    render(
      <Host initial={c}>{(ed) => <LevelUpSkillsStep ed={ed} characterId="c1" />}</Host>,
    );
    await settle();

    expect(screen.getByText(/about \d+ new skill rank/i)).toBeInTheDocument();
  });

  it("hides the banner when meta.startingClasses is absent â€” never guesses a baseline", async () => {
    const c = createDefaultCharacter({ name: "Skills Test 2" });
    c.identity.classes.push({ id: "cls_rogue", name: "Rogue", level: 4, presetKey: "rogue" });
    c.identity.totalLevel = 4;
    writeLevelUpMeta(c, { active: true, fromLevel: 3, targetLevel: 4, startedAt: "2026-07-12T00:00:00.000Z" });

    render(
      <Host initial={c}>{(ed) => <LevelUpSkillsStep ed={ed} characterId="c1" />}</Host>,
    );
    await settle();

    expect(screen.queryByText(/about \d+ new skill rank/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Level-up skills" })).toBeInTheDocument();
  });

  it("a class absent from the snapshot (brand-new this session) counts from level 0", async () => {
    const c = createDefaultCharacter({ name: "Skills Test 3" });
    c.identity.classes.push({ id: "cls_wizard", name: "Wizard", level: 1, presetKey: "wizard" });
    c.identity.totalLevel = 1;
    // startingClasses has NO entry for cls_wizard â€” it was multiclassed in THIS session.
    writeLevelUpMeta(c, {
      active: true,
      fromLevel: 3,
      targetLevel: 4,
      startedAt: "2026-07-12T00:00:00.000Z",
      startingClasses: [{ id: "cls_other", name: "Fighter", level: 3 }],
    });

    render(
      <Host initial={c}>{(ed) => <LevelUpSkillsStep ed={ed} characterId="c1" />}</Host>,
    );
    await settle();

    expect(screen.getByText(/about \d+ new skill rank/i)).toBeInTheDocument();
  });
});

describe("LEVEL_UP_STEPS registry â€” visibility predicates", () => {
  function stubEd(c: PathForgeCharacterV1): CharacterEditorApi {
    return { draft: c, computed: computeCharacter(c) } as unknown as CharacterEditorApi;
  }

  it("fromLevel 3 â†’ targetLevel 4: asi is visible, feats is not (crosses level 4, not an odd level)", () => {
    const c = createDefaultCharacter({ name: "Vis Test" });
    writeLevelUpMeta(c, { active: true, fromLevel: 3, targetLevel: 4, startedAt: "2026-07-12T00:00:00.000Z" });
    const ed = stubEd(c);

    const visibleKeys = LEVEL_UP_STEPS.filter((s) => !s.visible || s.visible(ed)).map((s) => s.key);
    expect(visibleKeys).toContain("asi");
    expect(visibleKeys).not.toContain("feats");
    expect(visibleKeys).toEqual(["class", "hp", "skills", "asi", "review"]);
  });

  it("fromLevel 3 â†’ targetLevel 7 (catch-up): both feats and asi are visible", () => {
    const c = createDefaultCharacter({ name: "Vis Test 2" });
    writeLevelUpMeta(c, { active: true, fromLevel: 3, targetLevel: 7, startedAt: "2026-07-12T00:00:00.000Z" });
    const ed = stubEd(c);

    const visibleKeys = LEVEL_UP_STEPS.filter((s) => !s.visible || s.visible(ed)).map((s) => s.key);
    expect(visibleKeys).toEqual(["class", "hp", "skills", "feats", "asi", "review"]);
  });

  it("a non-caster excludes the spells step", () => {
    const c = createDefaultCharacter({ name: "Non-caster" });
    writeLevelUpMeta(c, { active: true, fromLevel: 1, targetLevel: 2, startedAt: "2026-07-12T00:00:00.000Z" });
    const ed = stubEd(c);

    const visibleKeys = LEVEL_UP_STEPS.filter((s) => !s.visible || s.visible(ed)).map((s) => s.key);
    expect(visibleKeys).not.toContain("spells");
  });

  it("a caster (a spellcasting.casters entry) includes the spells step", () => {
    const c = createDefaultCharacter({ name: "Caster" });
    c.spellcasting.casters.push({
      id: "cl1",
      className: "Wizard",
      casterType: "prepared",
      casterLevel: 1,
      concentrationFormula: "",
      castingAbility: "int",
      conditionalModifiers: [],
      spellsPerDay: {},
      bonusSpells: {},
      saveDcFormula: "",
      autoSlots: false,
    });
    writeLevelUpMeta(c, { active: true, fromLevel: 1, targetLevel: 2, startedAt: "2026-07-12T00:00:00.000Z" });
    const ed = stubEd(c);

    const visibleKeys = LEVEL_UP_STEPS.filter((s) => !s.visible || s.visible(ed)).map((s) => s.key);
    expect(visibleKeys).toContain("spells");
  });

  it("with no active session (meta null), feats/asi are hidden â€” fail closed, never guessed", () => {
    const c = createDefaultCharacter({ name: "No Session" });
    const ed = stubEd(c);
    const visibleKeys = LEVEL_UP_STEPS.filter((s) => !s.visible || s.visible(ed)).map((s) => s.key);
    expect(visibleKeys).not.toContain("feats");
    expect(visibleKeys).not.toContain("asi");
  });
});
