import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";

// Written to a SEPARATE file from wizard-steps.test.tsx / wizard-steps-b.test.tsx (legs A/B's files)
// to avoid two subagents racing on the same test file — same convention wizard-steps-b.test.tsx
// documents. Covers leg C: the Feats/Traits/Drawbacks step, the HP step, and the Class step's
// archetype disclosure + gestalt hint. Same harness preamble as every other use-character-editor
// wizard-step test in this repo.

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

// Chainable, thenable no-op Supabase query builder — every picker's search effect resolves
// `{ data: [], error: null }` under jsdom (copied verbatim from wizard-steps(-b).test.tsx).
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

import { useCharacterEditor } from "@/components/character/editor/use-character-editor";
import { FeatsStep } from "@/components/character/wizard/steps/feats-step";
import { HpStep } from "@/components/character/wizard/steps/hp-step";
import { ClassStep } from "@/components/character/wizard/steps/class-step";

async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

/** A tiny host that owns the ONE `useCharacterEditor` instance, like the wizard shell does. */
function StepHost({
  characterId,
  initial,
  initialVersion,
  step,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
  initialVersion: number;
  step: "feats" | "hp" | "class";
}) {
  const ed = useCharacterEditor(characterId, initial, initialVersion);
  if (step === "feats") return <FeatsStep ed={ed} characterId={characterId} />;
  if (step === "hp") return <HpStep ed={ed} characterId={characterId} />;
  return <ClassStep ed={ed} characterId={characterId} />;
}

describe("S6 Pillar 3 slice W2 — Feats/HP/Class(archetype+gestalt) steps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("FeatsStep", () => {
    it("renders Browse buttons and existing feats/traits as removable chips, without a Drawbacks browse by default", async () => {
      const base = createDefaultCharacter({ name: "Feats Test" });
      base.feats.list.push({ id: "f1", name: "Power Attack", type: "Combat", tags: [], automation: [] });
      base.traits.list.push({ id: "t1", name: "Reactionary", type: "Combat", automation: [] });
      render(<StepHost characterId="ft1" initial={base} initialVersion={1} step="feats" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("button", { name: /browse feats/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /browse traits/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /drawbacks & flaws/i })).not.toBeInTheDocument();

      expect(screen.getByText("Power Attack")).toBeInTheDocument();
      expect(screen.getByText("Reactionary")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove power attack/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove reactionary/i })).toBeInTheDocument();
    });

    it("shows the Drawbacks & flaws browse button only when the flaws_drawbacks module is enabled", async () => {
      const base = createDefaultCharacter({ name: "Drawback Gate" });
      base.rules.modules.push({ key: "flaws_drawbacks", enabled: true, settings: {} });
      render(<StepHost characterId="ft2" initial={base} initialVersion={1} step="feats" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("button", { name: /drawbacks & flaws/i })).toBeInTheDocument();
    });

    it("removing a feat chip writes feats.list via the save loop, mirroring the editor's splice-by-index write", async () => {
      const base = createDefaultCharacter({ name: "Remove Feat" });
      base.feats.list.push({ id: "f1", name: "Toughness", tags: [], automation: [] });
      render(<StepHost characterId="ft3" initial={base} initialVersion={1} step="feats" />);
      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: /remove toughness/i }));
      await settle();

      expect(saveMock).toHaveBeenCalled();
      const call = saveMock.mock.calls.at(-1);
      const sheet = call?.[1] as PathForgeCharacterV1;
      expect(sheet.feats.list).toHaveLength(0);
    });
  });

  describe("HpStep", () => {
    it("shows the computed Max HP and writes a manual override into health.maxHp via the save loop", async () => {
      const base = createDefaultCharacter({ name: "HP Test" });
      render(<StepHost characterId="hp1" initial={base} initialVersion={1} step="hp" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(/your character.s max hp/i)).toBeInTheDocument();
      // Default fixture has no classes yet — nothing to compute from.
      expect(screen.getByText(/add a class on the class step/i)).toBeInTheDocument();

      const override = screen.getByLabelText("Max HP");
      fireEvent.change(override, { target: { value: "42" } });
      await settle();

      expect(saveMock).toHaveBeenCalled();
      const call = saveMock.mock.calls.at(-1);
      const sheet = call?.[1] as PathForgeCharacterV1;
      expect(sheet.health.maxHp).toBe(42);
    });

    it("'Apply to Max HP' commits the level-based computation (first level always max die + Con)", async () => {
      const base = createDefaultCharacter({ name: "Apply HP" });
      base.identity.classes.push({ id: "cls1", name: "Fighter", level: 1, hitDie: "d10" });
      render(<StepHost characterId="hp2" initial={base} initialVersion={1} step="hp" />);
      await act(async () => {
        await Promise.resolve();
      });

      // Con score 10 (default) → +0 mod; first level always takes the full die (10) → 10 HP.
      fireEvent.click(screen.getByRole("button", { name: /apply to max hp/i }));
      await settle();

      expect(saveMock).toHaveBeenCalled();
      const call = saveMock.mock.calls.at(-1);
      const sheet = call?.[1] as PathForgeCharacterV1;
      expect(sheet.health.maxHp).toBe(10);
      expect(sheet.health.currentHp).toBe(10);
    });

    it("shows a favored-class checkbox per class; toggling it writes favoredClass + syncs progression.favoredClasses", async () => {
      const base = createDefaultCharacter({ name: "Favored" });
      base.identity.classes.push({ id: "cls1", name: "Fighter", level: 2, hitDie: "d10" });
      render(<StepHost characterId="hp3" initial={base} initialVersion={1} step="hp" />);
      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByLabelText(/fighter is a favored class/i));
      await settle();

      expect(saveMock).toHaveBeenCalled();
      const call = saveMock.mock.calls.at(-1);
      const sheet = call?.[1] as PathForgeCharacterV1;
      expect(sheet.identity.classes[0]?.favoredClass).toBe(true);
      expect(sheet.progression.favoredClasses).toContain("Fighter");
    });
  });

  describe("ClassStep — archetype disclosure", () => {
    it("does not render the archetype disclosure with no classes applied", async () => {
      const base = createDefaultCharacter({ name: "No Class" });
      render(<StepHost characterId="cs1" initial={base} initialVersion={1} step="class" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText(/optional: apply an archetype/i)).not.toBeInTheDocument();
    });

    it("renders the archetype disclosure, collapsed by default, once a class is applied — opening it reveals the per-class Archetypes button", async () => {
      const base = createDefaultCharacter({ name: "One Class" });
      base.identity.classes.push({ id: "cls1", name: "Fighter", level: 1, presetKey: "fighter" });
      render(<StepHost characterId="cs2" initial={base} initialVersion={1} step="class" />);
      await act(async () => {
        await Promise.resolve();
      });

      const disclosure = screen.getByRole("button", { name: /optional: apply an archetype/i });
      expect(disclosure).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("button", { name: /^archetypes$/i })).not.toBeInTheDocument();

      fireEvent.click(disclosure);
      const archBtn = screen.getByRole("button", { name: /^archetypes$/i });
      fireEvent.click(archBtn);
      await settle();

      expect(screen.getByRole("textbox", { name: /search archetypes/i })).toBeInTheDocument();
    });
  });

  describe("ClassStep — gestalt hint", () => {
    it("shows no gestalt hint when the module is off, even with one class", async () => {
      const base = createDefaultCharacter({ name: "No Gestalt" });
      base.identity.classes.push({ id: "cls1", name: "Fighter", level: 1, presetKey: "fighter" });
      render(<StepHost characterId="cs3" initial={base} initialVersion={1} step="class" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText(/gestalt is on/i)).not.toBeInTheDocument();
    });

    it("shows the 'add your second class' hint only when gestalt is on and exactly one class is applied", async () => {
      const base = createDefaultCharacter({ name: "Gestalt One Class" });
      base.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
      base.identity.classes.push({ id: "cls1", name: "Fighter", level: 1, presetKey: "fighter" });
      render(<StepHost characterId="cs4" initial={base} initialVersion={1} step="class" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(/gestalt is on/i)).toBeInTheDocument();
      expect(screen.getByText(/track b/i)).toBeInTheDocument();
    });

    it("shows no hint with zero classes even when gestalt is enabled", async () => {
      const base = createDefaultCharacter({ name: "Gestalt No Class" });
      base.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
      render(<StepHost characterId="cs5" initial={base} initialVersion={1} step="class" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText(/gestalt is on/i)).not.toBeInTheDocument();
    });

    it("shows a 'tracks aren't split' banner (not the single-class hint) once a second class collapses onto the same track, and Split fixes it", async () => {
      const base = createDefaultCharacter({ name: "Gestalt Collapsed" });
      base.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
      base.identity.classes.push({ id: "cls1", name: "Fighter", level: 1, presetKey: "fighter" });
      base.identity.classes.push({ id: "cls2", name: "Rogue", level: 1, presetKey: "rogue" });
      render(<StepHost characterId="cs6" initial={base} initialVersion={1} step="class" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText(/^gestalt is on/i)).not.toBeInTheDocument();
      expect(screen.getByText(/tracks aren't split/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /split into a \/ b/i }));
      await settle();

      expect(saveMock).toHaveBeenCalled();
      const call = saveMock.mock.calls.at(-1);
      const sheet = call?.[1] as PathForgeCharacterV1;
      expect(sheet.identity.classes[0]?.track).toBe("a");
      expect(sheet.identity.classes[1]?.track).toBe("b");
    });

    it("no hint or banner once two classes are cleanly split across tracks", async () => {
      const base = createDefaultCharacter({ name: "Gestalt Split" });
      base.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
      base.identity.classes.push({ id: "cls1", name: "Fighter", level: 1, presetKey: "fighter", track: "a" });
      base.identity.classes.push({ id: "cls2", name: "Rogue", level: 1, presetKey: "rogue", track: "b" });
      render(<StepHost characterId="cs7" initial={base} initialVersion={1} step="class" />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText(/gestalt is on/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/tracks aren't split/i)).not.toBeInTheDocument();
    });
  });
});
