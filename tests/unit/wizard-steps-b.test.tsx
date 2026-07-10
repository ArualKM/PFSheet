import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { createDefaultCharacter, writeWizardMeta, type PathForgeCharacterV1 } from "@pathforge/schema";

// Written to a SEPARATE file from tests/unit/wizard-steps.test.tsx (leg A's file) to avoid two
// subagents racing on the same test file — see the task handoff note. Same harness preamble as
// wizard-shell.test.tsx / character-editor-layouts.test.tsx.

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

// Mock only the save server action (like the other editor/wizard tests) — merge/compute run for real.
const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("@/lib/actions/characters", () => ({ saveCharacterSheetAction: saveMock }));

// Browser Supabase client stub: a chainable, thenable no-op query builder (copied verbatim from
// wizard-shell.test.tsx / character-editor-layouts.test.tsx) — GearStep queries class_compendium on
// mount, InventoryEditor doesn't query at all, but CharacterEditor's other pickers create the client
// eagerly at module scope, so this must always resolve safely under jsdom.
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
import { CharacterEditor } from "@/components/character/editor/character-editor";
import { DetailsStep } from "@/components/character/wizard/steps/details-step";
import { GearStep } from "@/components/character/wizard/steps/gear-step";
import { SkillsStep } from "@/components/character/wizard/steps/skills-step";

// Pump fake timers + the save loop's microtasks until everything settles (same idiom as every other
// use-character-editor-backed test in this repo).
async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

/** A tiny host that owns the ONE `useCharacterEditor` instance, like CharacterWizard does, so a
 *  single step file can be rendered standalone without pulling in the whole wizard shell. */
function StepHost({
  characterId,
  initial,
  initialVersion,
  step,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
  initialVersion: number;
  step: "gear" | "details" | "skills";
}) {
  const ed = useCharacterEditor(characterId, initial, initialVersion);
  if (step === "gear") return <GearStep ed={ed} characterId={characterId} />;
  if (step === "skills") return <SkillsStep ed={ed} characterId={characterId} />;
  return <DetailsStep ed={ed} characterId={characterId} />;
}

describe("S6 Pillar 3 slice W2 — Skills/Gear/Details steps + editor resume banner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("skills step lists every skill and writes a rank change into skills.list via the save loop", async () => {
    const base = createDefaultCharacter({ name: "Skills Test" });
    render(<StepHost characterId="s1" initial={base} initialVersion={1} step="skills" />);
    await act(async () => {
      await Promise.resolve();
    });

    // Every default skill is listed (a spot check — Perception is a plain, non-repeatable skill).
    const perceptionInput = screen.getByLabelText(/^perception$/i);
    fireEvent.change(perceptionInput, { target: { value: "3" } });

    await settle();
    expect(saveMock).toHaveBeenCalled();
    const call = saveMock.mock.calls.at(-1);
    const sheet = call?.[1] as PathForgeCharacterV1;
    const perception = sheet.skills.list.find((s) => s.key === "perception");
    expect(perception?.ranks).toBe(3);
  });

  it("skills step never invents a skill-point budget the engine doesn't expose", async () => {
    const base = createDefaultCharacter({ name: "No Budget" });
    render(<StepHost characterId="s2" initial={base} initialVersion={1} step="skills" />);
    await act(async () => {
      await Promise.resolve();
    });
    // No Background Skills variant enabled on the default character — no "Background:" budget text.
    expect(screen.queryByText(/background:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ranks spent/i)).toBeInTheDocument();
  });

  it("gear step renders InventoryEditor (Wealth section) above the wrapped editor", async () => {
    const base = createDefaultCharacter({ name: "Gear Test" });
    render(<StepHost characterId="g1" initial={base} initialVersion={1} step="gear" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: /^gear & wealth$/i })).toBeInTheDocument();
    // InventoryEditor's own "Wealth" section heading proves the real component mounted, not a stub
    // (an exact/level-3 match, since the step's own "Gear & wealth" h2 also matches /wealth/i).
    expect(screen.getByRole("heading", { name: /^wealth$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByLabelText(/^gold$/i)).toBeInTheDocument();
  });

  it("gear step never auto-applies a starting-wealth suggestion to the coin fields", async () => {
    const base = createDefaultCharacter({ name: "No Auto Gold" });
    base.identity.classes.push({ id: "cls1", name: "Fighter", level: 1 });
    render(<StepHost characterId="g2" initial={base} initialVersion={1} step="gear" />);
    await act(async () => {
      await Promise.resolve();
    });
    // The stubbed Supabase client always resolves { data: [] } (no starting_wealth row found) — the
    // suggestion banner must simply not render, and the Gold field must stay at its default (0).
    expect(screen.queryByText(/typical starting wealth/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^gold$/i)).toHaveValue(0);
  });

  it("details step writes name/alignment/deity/homeland/backstory into identity + profile via the save loop", async () => {
    const base = createDefaultCharacter({ name: "Original" });
    render(<StepHost characterId="d1" initial={base} initialVersion={1} step="details" />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Aria Nightshade" } });
    fireEvent.change(screen.getByLabelText(/^alignment$/i), { target: { value: "CG" } });
    fireEvent.change(screen.getByLabelText(/^deity$/i), { target: { value: "Desna" } });
    fireEvent.change(screen.getByLabelText(/^homeland$/i), { target: { value: "Absalom" } });
    fireEvent.change(screen.getByLabelText(/^backstory$/i), { target: { value: "Ran away from home." } });

    await settle();
    expect(saveMock).toHaveBeenCalled();
    const call = saveMock.mock.calls.at(-1);
    const sheet = call?.[1] as PathForgeCharacterV1;
    expect(sheet.identity).toMatchObject({
      name: "Aria Nightshade",
      alignment: "CG",
      deity: "Desna",
      homeland: "Absalom",
    });
    expect(sheet.profile.backstory).toBe("Ran away from home.");
  });

  it("the editor's resume banner renders for an active-wizard character and links to /wizard", async () => {
    const wizardChar = createDefaultCharacter({ name: "Mid Wizard" });
    writeWizardMeta(wizardChar, { active: true, step: "class", startedAt: "2026-07-09T00:00:00.000Z" });
    render(<CharacterEditor characterId="e1" initial={wizardChar} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/finish guided setup/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /resume the wizard/i });
    expect(link).toHaveAttribute("href", "/characters/e1/wizard");
  });

  it("the resume banner does NOT render for a normal (non-wizard) character", async () => {
    const normal = createDefaultCharacter({ name: "Normal Character" });
    render(<CharacterEditor characterId="e2" initial={normal} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText(/finish guided setup/i)).not.toBeInTheDocument();
  });

  it("the resume banner does NOT render once the wizard is completed (active=false)", async () => {
    const completed = createDefaultCharacter({ name: "Completed Wizard" });
    writeWizardMeta(completed, {
      active: false,
      step: "done",
      startedAt: "2026-07-09T00:00:00.000Z",
      completedAt: "2026-07-09T00:10:00.000Z",
    });
    render(<CharacterEditor characterId="e3" initial={completed} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText(/finish guided setup/i)).not.toBeInTheDocument();
  });

  it("dismissing the resume banner hides it locally without touching wizard.active", async () => {
    const wizardChar = createDefaultCharacter({ name: "Dismiss Me" });
    writeWizardMeta(wizardChar, { active: true, step: "gear", startedAt: "2026-07-09T00:00:00.000Z" });
    render(<CharacterEditor characterId="e4" initial={wizardChar} initialVersion={1} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/finish guided setup/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss guided-setup reminder/i }));
    expect(screen.queryByText(/finish guided setup/i)).not.toBeInTheDocument();
    // Dismissal is local UI state only — no save should have fired from clicking X.
    expect(saveMock).not.toHaveBeenCalled();
  });
});
