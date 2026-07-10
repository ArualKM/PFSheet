import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";

// S6 Pillar 3 slice W2 — the three PICKER steps (race / class / abilities). Harness preamble copied
// from tests/unit/wizard-shell.test.tsx: these steps render real editor pickers (RacePicker,
// ClassCompendiumPicker) which touch jsdom-missing browser APIs and a Supabase client at module
// scope.
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

import { useCharacterEditor, type CharacterEditorApi } from "@/components/character/editor/use-character-editor";
import { RaceStep, canAdvanceRace } from "@/components/character/wizard/steps/race-step";
import { ClassStep, canAdvanceClass } from "@/components/character/wizard/steps/class-step";
import { AbilitiesStep, canAdvanceAbilities } from "@/components/character/wizard/steps/abilities-step";

/** Mounts a real `useCharacterEditor` and hands the live `ed` (wrapped so callers can count
 * `update()` calls) to a render-prop child — the "tiny host component" the task brief allows in
 * place of driving the full `CharacterWizard`/`WizardShell`. */
function Host({
  initial,
  onEd,
  children,
}: {
  initial: PathForgeCharacterV1;
  onEd: (ed: CharacterEditorApi, updateCallCount: () => number) => void;
  children: (ed: CharacterEditorApi) => ReactNode;
}) {
  const ed = useCharacterEditor("wizard-steps-test", initial, 1);
  const wrapped: CharacterEditorApi = {
    ...ed,
    update: (mutate) => {
      hostUpdateCallCount += 1;
      ed.update(mutate);
    },
  };
  // Publish the handle from an effect, not render; RTL guarantees effects have run before the
  // test's first fireEvent. The counter is a plain module variable (reset per test) — a ref here
  // trips react-hooks/refs through the render-invoked children(wrapped) closure.
  useEffect(() => {
    onEd(wrapped, () => hostUpdateCallCount);
  });
  return <>{children(wrapped)}</>;
}

/** Counts wrapped ed.update calls across a single test — reset in each beforeEach. */
let hostUpdateCallCount = 0;

// Same fake-timer "pump the save loop + any debounced picker search" idiom as
// wizard-shell.test.tsx / use-character-editor.test.tsx — real timers would leave the autosave
// debounce (900ms) and RacePicker/ClassCompendiumPicker's own search debounce (250ms) dangling past
// the end of each test.
async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

function fixture(): PathForgeCharacterV1 {
  return createDefaultCharacter({ name: "New Hero" });
}

describe("wizard steps — race / class / abilities (S6 Pillar 3, slice W2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
    hostUpdateCallCount = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("canAdvanceClass", () => {
    it("is false with no classes", () => {
      const c = fixture();
      expect(canAdvanceClass({ draft: c } as unknown as CharacterEditorApi)).toBe(false);
    });

    it("is false for a class row with no resolvable preset (e.g. a hand-added Custom class)", () => {
      const c = fixture();
      c.identity.classes.push({ id: "cls_custom", name: "Custom", level: 1 });
      expect(canAdvanceClass({ draft: c } as unknown as CharacterEditorApi)).toBe(false);
    });

    it("is true once a class row resolves to a preset (catalog presetKey)", () => {
      const c = fixture();
      c.identity.classes.push({ id: "cls_fighter", name: "Fighter", level: 1, presetKey: "fighter" });
      expect(canAdvanceClass({ draft: c } as unknown as CharacterEditorApi)).toBe(true);
    });
  });

  describe("canAdvanceRace", () => {
    it("is false with no race applied, true once identity.raceApplied is set", () => {
      const c = fixture();
      expect(canAdvanceRace({ draft: c } as unknown as CharacterEditorApi)).toBe(false);
      c.identity.raceApplied = { name: "Dwarf", abilityMods: { con: 2, wis: 2, cha: -2 } };
      expect(canAdvanceRace({ draft: c } as unknown as CharacterEditorApi)).toBe(true);
    });
  });

  describe("canAdvanceAbilities", () => {
    it("is true when Point Buy has never been turned on", () => {
      const c = fixture();
      expect(canAdvanceAbilities({ draft: c } as unknown as CharacterEditorApi)).toBe(true);
    });

    it("is false when overspent", () => {
      const c = fixture();
      c.abilities.pointBuy = {
        enabled: true,
        done: false,
        budget: 15,
        system: "standard",
        minScore: 7,
        maxScore: 18,
        allocations: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 },
        racial: {},
      };
      expect(canAdvanceAbilities({ draft: c } as unknown as CharacterEditorApi)).toBe(false);
    });

    it("is true within budget", () => {
      const c = fixture();
      c.abilities.pointBuy = {
        enabled: true,
        done: false,
        budget: 15,
        system: "standard",
        minScore: 7,
        maxScore: 18,
        allocations: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 7 },
        racial: {},
      };
      // spend: 5+5+5+0+0-4 = 11 <= 15
      expect(canAdvanceAbilities({ draft: c } as unknown as CharacterEditorApi)).toBe(true);
    });
  });

  describe("RaceStep", () => {
    it("renders the popular-race quick-pick chips", async () => {
      let latestEd: CharacterEditorApi | undefined;
      render(
        <Host initial={fixture()} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <RaceStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      expect(latestEd).toBeDefined();

      for (const name of ["Human", "Elf", "Dwarf", "Halfling"]) {
        expect(screen.getByRole("button", { name })).toBeInTheDocument();
      }
    });

    it("clicking a quick-pick chip does not throw and keeps the picker mounted", async () => {
      render(
        <Host initial={fixture()} onEd={() => {}}>
          {(ed) => <RaceStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      fireEvent.click(screen.getByRole("button", { name: "Dwarf" }));
      await settle();

      // The picker re-mounts (keyed on the query) with the new initial query as its search value.
      expect(screen.getByRole("textbox", { name: /search races/i })).toHaveValue("Dwarf");
    });
  });

  describe("ClassStep", () => {
    it("renders without the Base/Prestige segmented control (baseOnly)", async () => {
      render(
        <Host initial={fixture()} onEd={() => {}}>
          {(ed) => <ClassStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      expect(screen.queryByRole("group", { name: /class type/i })).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /search the class compendium/i })).toBeInTheDocument();
    });
  });

  describe("AbilitiesStep", () => {
    it("turns Point Buy on at step entry without clobbering an already-enabled block", async () => {
      let latestEd: CharacterEditorApi | undefined;
      const c = fixture();
      render(
        <Host initial={c} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      expect(latestEd?.draft.abilities.pointBuy?.enabled).toBe(true);
      expect(latestEd?.draft.abilities.pointBuy?.budget).toBe(15);
    });

    it("'Use a recommended array' writes all six scores in one ed.update call", async () => {
      let latestEd: CharacterEditorApi | undefined;
      let updateCallCount: (() => number) | undefined;
      render(
        <Host
          initial={fixture()}
          onEd={(ed, count) => {
            latestEd = ed;
            updateCallCount = count;
          }}
        >
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      const countBefore = updateCallCount!();

      fireEvent.click(screen.getByRole("button", { name: /use a recommended array/i }));
      await settle();

      // Exactly one ed.update() call for the click (the step-entry effect's own call already
      // happened before this, captured in countBefore).
      expect(updateCallCount!()).toBe(countBefore + 1);

      // No class chosen → key ability falls back to STR: str gets the top of the array, the rest
      // follow the secondary priority order (con, dex, wis, int, cha).
      const primary = latestEd!.draft.abilities.primary;
      expect(primary.str.score).toBe(15);
      expect(primary.con.score).toBe(14);
      expect(primary.dex.score).toBe(13);
      expect(primary.wis.score).toBe(12);
      expect(primary.int.score).toBe(10);
      expect(primary.cha.score).toBe(8);
    });

    it("biases the recommended array to the chosen class's casting ability", async () => {
      let latestEd: CharacterEditorApi | undefined;
      const c = fixture();
      c.identity.classes.push({ id: "cls_wizard", name: "Wizard", level: 1, presetKey: "wizard" });
      render(
        <Host initial={c} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      fireEvent.click(screen.getByRole("button", { name: /use a recommended array/i }));
      await settle();

      // Wizard's ClassPreset.caster.castingAbility is "int" — it should claim the top score.
      expect(latestEd!.draft.abilities.primary.int.score).toBe(15);
    });

    it("blocks Next once the recommended array (or a manual edit) goes over budget", async () => {
      let latestEd: CharacterEditorApi | undefined;
      render(
        <Host initial={fixture()} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      expect(canAdvanceAbilities(latestEd!)).toBe(true);

      const [strInput] = screen.getAllByLabelText("Score");
      fireEvent.change(strInput!, { target: { value: "30" } });
      await settle();

      // Clamped to the point-buy max (18), which is still over the 15-pt budget on its own — Next
      // should now be blocked.
      expect(canAdvanceAbilities(latestEd!)).toBe(false);
    });
  });
});
