import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";

// New leg (systems step + point-buy budgets + BG skill ranks) — written to its OWN file to avoid
// racing other subagents editing tests/unit/wizard-steps.test.tsx / wizard-steps-b.test.tsx at the
// same time. Harness preamble copied verbatim from wizard-steps.test.tsx.

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
import { SystemsStep } from "@/components/character/wizard/steps/systems-step";
import { AbilitiesStep } from "@/components/character/wizard/steps/abilities-step";
import { SkillsStep } from "@/components/character/wizard/steps/skills-step";

/** Same "tiny host" idiom as wizard-steps.test.tsx: a real `useCharacterEditor`, `ed` handed out
 * via a render-prop child, `update()` wrapped to count calls. */
function Host({
  initial,
  onEd,
  children,
}: {
  initial: PathForgeCharacterV1;
  onEd: (ed: CharacterEditorApi, updateCallCount: () => number) => void;
  children: (ed: CharacterEditorApi) => ReactNode;
}) {
  const ed = useCharacterEditor("wizard-steps-systems-test", initial, 1);
  const wrapped: CharacterEditorApi = {
    ...ed,
    update: (mutate) => {
      hostUpdateCallCount += 1;
      ed.update(mutate);
    },
  };
  useEffect(() => {
    onEd(wrapped, () => hostUpdateCallCount);
  });
  return <>{children(wrapped)}</>;
}

let hostUpdateCallCount = 0;

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

describe("wizard steps — systems / abilities budgets / BG skill ranks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
    hostUpdateCallCount = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("SystemsStep", () => {
    it("renders only implemented (non-'coming soon') modules, grouped by Paizo / Subsystems / Third-party", async () => {
      render(
        <Host initial={fixture()} onEd={() => {}}>
          {(ed) => <SystemsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      expect(screen.getByRole("heading", { name: /paizo optional rules/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /subsystems & tracking/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /third-party content/i })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Mythic Adventures" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Hero Points" })).toBeInTheDocument();
      // "Sanity" is a real OPTIONAL_RULE_MODULES entry but has no system built yet — must not render.
      expect(screen.queryByRole("checkbox", { name: "Sanity" })).not.toBeInTheDocument();
    });

    it("toggling a variant-backed module writes the exact rules.variants shape", async () => {
      let latestEd: CharacterEditorApi | undefined;
      render(
        <Host initial={fixture()} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <SystemsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      expect(latestEd!.draft.rules.variants.mythic).toBeUndefined();

      fireEvent.click(screen.getByRole("checkbox", { name: "Mythic Adventures" }));
      await settle();
      expect(latestEd!.draft.rules.variants.mythic).toBe(true);

      fireEvent.click(screen.getByRole("checkbox", { name: "Mythic Adventures" }));
      await settle();
      // off === undefined, not false — matches OptionalRulesEditor's `on || undefined`.
      expect(latestEd!.draft.rules.variants.mythic).toBeUndefined();
    });

    it("toggling a modules[]-backed module (no variantKey) pushes/splices the exact shape", async () => {
      let latestEd: CharacterEditorApi | undefined;
      render(
        <Host initial={fixture()} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <SystemsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      expect(latestEd!.draft.rules.modules).toHaveLength(0);

      fireEvent.click(screen.getByRole("checkbox", { name: "Hero Points" }));
      await settle();
      expect(latestEd!.draft.rules.modules).toEqual([{ key: "hero_points", enabled: true, settings: {} }]);

      fireEvent.click(screen.getByRole("checkbox", { name: "Hero Points" }));
      await settle();
      expect(latestEd!.draft.rules.modules).toHaveLength(0);
    });

    it("enabling Gestalt on a collapsed (unsplit) two-class sheet auto-splits the tracks", async () => {
      let latestEd: CharacterEditorApi | undefined;
      const c = fixture();
      c.identity.classes.push({ id: "cls_a", name: "Fighter", level: 5 });
      c.identity.classes.push({ id: "cls_b", name: "Wizard", level: 3 });
      render(
        <Host initial={c} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <SystemsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      fireEvent.click(screen.getByRole("checkbox", { name: "Gestalt" }));
      await settle();

      const classes = latestEd!.draft.identity.classes;
      expect(classes[0]!.track).toBe("a");
      expect(classes[1]!.track).toBe("b");
      // Gestalt character level = the higher track, NOT the sum (5, not 8).
      expect(latestEd!.draft.identity.totalLevel).toBe(5);
    });

    it("shows the gestalt-collapse banner + Split button for a sheet that's already gestalt+collapsed", async () => {
      let latestEd: CharacterEditorApi | undefined;
      const c = fixture();
      c.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
      c.identity.classes.push({ id: "cls_a", name: "Fighter", level: 5 });
      c.identity.classes.push({ id: "cls_b", name: "Wizard", level: 3 });
      render(
        <Host initial={c} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <SystemsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      expect(screen.getByText(/gestalt tracks aren.t split/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /split into a \/ b/i }));
      await settle();

      expect(screen.queryByText(/gestalt tracks aren.t split/i)).not.toBeInTheDocument();
      const classes = latestEd!.draft.identity.classes;
      expect(classes[0]!.track).toBe("a");
      expect(classes[1]!.track).toBe("b");
    });
  });

  describe("AbilitiesStep — point-buy budget", () => {
    it("defaults to the Standard (15) preset and shows the unspent-points nudge at 15/15 remaining", async () => {
      render(
        <Host initial={fixture()} onEd={() => {}}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      expect(screen.getByRole("button", { name: /standard \(15\)/i })).toHaveAttribute("aria-pressed", "true");
      // A fresh character seeds every allocation at 10 (cost 0), so all 15 points are unspent.
      expect(screen.getByText(/you still have 15 points to spend/i)).toBeInTheDocument();
    });

    it("clicking a preset writes pb.budget without resetting allocations", async () => {
      let latestEd: CharacterEditorApi | undefined;
      render(
        <Host initial={fixture()} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      const strBefore = latestEd!.draft.abilities.pointBuy?.allocations.str;

      fireEvent.click(screen.getByRole("button", { name: /low \(10\)/i }));
      await settle();

      expect(latestEd!.draft.abilities.pointBuy?.budget).toBe(10);
      expect(latestEd!.draft.abilities.pointBuy?.allocations.str).toBe(strBefore);
      expect(screen.getByText(/you still have 10 points to spend/i)).toBeInTheDocument();
    });

    it("Custom reveals a number field that writes an arbitrary budget (5-60)", async () => {
      let latestEd: CharacterEditorApi | undefined;
      render(
        <Host initial={fixture()} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      expect(screen.queryByLabelText(/custom budget/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^custom$/i }));
      await settle();
      const customInput = screen.getByLabelText(/custom budget/i);
      expect(customInput).toBeInTheDocument();

      fireEvent.change(customInput, { target: { value: "42" } });
      await settle();
      expect(latestEd!.draft.abilities.pointBuy?.budget).toBe(42);
    });

    it("Custom mode is STICKY: editing through a preset value keeps the field mounted", async () => {
      // A sheet arriving with a non-preset budget shows Custom without any click; changing its
      // value down THROUGH a preset (22 → 20) must NOT unmount the focused field and silently
      // light up the "High (20)" preset button (a review finding).
      const c = fixture();
      c.abilities.pointBuy = {
        enabled: true,
        done: false,
        budget: 22,
        system: "standard",
        minScore: 7,
        maxScore: 18,
        allocations: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        racial: {},
      };
      render(
        <Host initial={c} onEd={() => {}}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      const customInput = screen.getByLabelText(/custom budget/i);
      fireEvent.change(customInput, { target: { value: "20" } });
      await settle();
      expect(screen.getByLabelText(/custom budget/i)).toBeInTheDocument();
    });

    it("shows the nudge when points remain, and hides it once fully spent", async () => {
      const partial = fixture();
      partial.abilities.pointBuy = {
        enabled: true,
        done: false,
        budget: 15,
        system: "standard",
        minScore: 7,
        maxScore: 18,
        allocations: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 7 },
        racial: {},
      };
      render(
        <Host initial={partial} onEd={() => {}}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      // spend: 5+5+5+0+0-4 = 11 <= 15 → still 4 remaining, nudge shows.
      expect(screen.getByText(/you still have 4 points to spend/i)).toBeInTheDocument();
      cleanup();

      const full = fixture();
      full.abilities.pointBuy = {
        enabled: true,
        done: false,
        budget: 15,
        system: "standard",
        minScore: 7,
        maxScore: 18,
        // The standard recommended array — spends exactly 15 (7+5+3+2+0-2).
        allocations: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
        racial: {},
      };
      render(
        <Host initial={full} onEd={() => {}}>
          {(ed) => <AbilitiesStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();
      expect(screen.queryByText(/you still have/i)).not.toBeInTheDocument();
    });
  });

  describe("SkillsStep — Background Skills ranks", () => {
    it("shows no background-ranks field or budget when the variant is off", async () => {
      render(
        <Host initial={fixture()} onEd={() => {}}>
          {(ed) => <SkillsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      expect(screen.queryByLabelText(/appraise background ranks/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/background:/i)).not.toBeInTheDocument();
    });

    it("shows a background-ranks field for qualifying skills + a spent/budget readout when the variant is on", async () => {
      let latestEd: CharacterEditorApi | undefined;
      const c = fixture();
      c.rules.variants.backgroundSkills = true;
      render(
        <Host initial={c} onEd={(ed) => (latestEd = ed)}>
          {(ed) => <SkillsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      // Appraise is a Background skill (isBackgroundSkill) — gets the extra field.
      const bgInput = screen.getByLabelText(/appraise background ranks/i);
      expect(bgInput).toBeInTheDocument();
      expect(screen.getByText(/background:/i)).toBeInTheDocument();

      fireEvent.change(bgInput, { target: { value: "2" } });
      await settle();

      const appraise = latestEd!.draft.skills.list.find((s) => s.key === "appraise");
      expect(appraise?.backgroundRanks).toBe(2);
    });

    it("never adds a background-ranks field to a non-background skill even when the variant is on", async () => {
      const c = fixture();
      c.rules.variants.backgroundSkills = true;
      render(
        <Host initial={c} onEd={() => {}}>
          {(ed) => <SkillsStep ed={ed} characterId="c1" />}
        </Host>,
      );
      await settle();

      // Perception is not a Background skill.
      expect(screen.queryByLabelText(/perception background ranks/i)).not.toBeInTheDocument();
    });
  });
});
