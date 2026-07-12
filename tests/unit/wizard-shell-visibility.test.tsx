import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";

// Level-up wizard Stage 2 — tests for the GENERALIZED shell machinery (steps/visible/writeStep),
// exercised with a synthetic steps array rather than the create wizard's own CREATE_WIZARD_STEPS
// (those stay covered, unchanged, by wizard-shell.test.tsx + wizard-steps*.test.tsx). Harness
// preamble copied verbatim from tests/unit/wizard-shell.test.tsx — it exists because
// useCharacterEditor pulls in the same editor chrome CharacterEditor does, which touches a couple of
// jsdom-missing browser APIs and a module-scope Supabase client.
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
// wizard-shell.test.tsx's mock preamble (character-editor.tsx creates one at module scope, and its
// pickers query it on open).
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

// No synthetic step here calls useRouter(), but next/navigation is mocked anyway to match the
// wizard-shell.test.tsx preamble this harness is copied from (useCharacterEditor's module graph is
// shared with steps that do navigate).
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

import { useCharacterEditor } from "@/components/character/editor/use-character-editor";
import { WizardShell, type WizardStepDef } from "@/components/character/wizard/wizard-shell";

/** Mirrors character-wizard.tsx's shape (useCharacterEditor once, WizardShell underneath), but with
 *  a synthetic `steps` list and a trivial writeStep into a free-form metadata.custom key — this
 *  suite is testing the SHELL, not any particular wizard's own step table. */
function TestWizard({
  characterId,
  initial,
  steps,
  initialStep,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
  steps: WizardStepDef[];
  initialStep: string;
}) {
  const ed = useCharacterEditor(characterId, initial, 1);
  return (
    <WizardShell
      ed={ed}
      characterId={characterId}
      steps={steps}
      initialStep={initialStep}
      writeStep={(c, step) => {
        c.metadata.custom.testStep = step;
      }}
    />
  );
}

function fixture(name: string): PathForgeCharacterV1 {
  return createDefaultCharacter({ name });
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

describe("WizardShell — generalized step visibility (level-up wizard Stage 2)", () => {
  it("a step with visible:()=>false is absent from the spine and skipped by Next", async () => {
    const steps: WizardStepDef[] = [
      { key: "a", label: "Step A", help: "a", skippable: true, render: () => <h1>Step A</h1> },
      {
        key: "b",
        label: "Step B",
        help: "b",
        skippable: true,
        visible: () => false,
        render: () => <h1>Step B</h1>,
      },
      { key: "c", label: "Step C", help: "c", skippable: true, render: () => <h1>Step C</h1> },
    ];

    render(<TestWizard characterId="v1" initial={fixture("V1")} steps={steps} initialStep="a" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Step A" })).toBeInTheDocument();
    // Absent from the spine entirely — not just off-screen: no "Step B" text anywhere, and the
    // mobile spine's dot count reflects only the 2 VISIBLE steps.
    expect(screen.queryByText("Step B")).not.toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    // Next skips straight over the hidden step to the next VISIBLE one.
    expect(screen.getByRole("heading", { name: "Step C" })).toBeInTheDocument();
    expect(screen.queryByText("Step B")).not.toBeInTheDocument();
  });

  it("a predicate flipping true mid-session makes the step appear in the walk", async () => {
    const steps: WizardStepDef[] = [
      {
        key: "a",
        label: "Step A",
        help: "a",
        skippable: true,
        render: ({ ed }) => (
          <div>
            <h1>Step A</h1>
            <button
              type="button"
              onClick={() =>
                ed.update((c) => {
                  c.metadata.custom.flagKey = true;
                })
              }
            >
              Reveal B
            </button>
          </div>
        ),
      },
      {
        key: "b",
        label: "Step B",
        help: "b",
        skippable: true,
        visible: (ed) => ed.draft.metadata.custom.flagKey === true,
        render: () => <h1>Step B</h1>,
      },
      { key: "c", label: "Step C", help: "c", skippable: true, render: () => <h1>Step C</h1> },
    ];

    render(<TestWizard characterId="v2" initial={fixture("V2")} steps={steps} initialStep="a" />);
    await act(async () => {
      await Promise.resolve();
    });

    // B starts hidden — only A and C count toward the spine.
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reveal b/i }));

    // Still on A (revealing B doesn't navigate), but the spine now counts 3 — re-evaluated this
    // render, not frozen at session start.
    expect(screen.getByRole("heading", { name: "Step A" })).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    // Next now lands on B (it's in the walk), not skipped to C.
    expect(screen.getByRole("heading", { name: "Step B" })).toBeInTheDocument();
  });

  it("initialStep pointing at a hidden step falls forward to the next visible one", async () => {
    const steps: WizardStepDef[] = [
      { key: "a", label: "Step A", help: "a", skippable: true, render: () => <h1>Step A</h1> },
      {
        key: "b",
        label: "Step B",
        help: "b",
        skippable: true,
        visible: () => false,
        render: () => <h1>Step B</h1>,
      },
      { key: "c", label: "Step C", help: "c", skippable: true, render: () => <h1>Step C</h1> },
    ];

    render(<TestWizard characterId="v3" initial={fixture("V3")} steps={steps} initialStep="b" />);
    await act(async () => {
      await Promise.resolve();
    });

    // Falls FORWARD past the hidden step — lands on C, not back on A.
    expect(screen.getByRole("heading", { name: "Step C" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Step A" })).not.toBeInTheDocument();
  });

  it("the current step's predicate flipping false lands the user on a still-visible step without crashing", async () => {
    const steps: WizardStepDef[] = [
      { key: "a", label: "Step A", help: "a", skippable: true, render: () => <h1>Step A</h1> },
      {
        key: "b",
        label: "Step B",
        help: "b",
        skippable: true,
        visible: (ed) => ed.draft.metadata.custom.flagKey !== false,
        render: ({ ed }) => (
          <div>
            <h1>Step B</h1>
            <button
              type="button"
              onClick={() =>
                ed.update((c) => {
                  c.metadata.custom.flagKey = false;
                })
              }
            >
              Hide me
            </button>
          </div>
        ),
      },
      { key: "c", label: "Step C", help: "c", skippable: true, render: () => <h1>Step C</h1> },
    ];

    render(<TestWizard characterId="v4" initial={fixture("V4")} steps={steps} initialStep="b" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Step B" })).toBeInTheDocument();

    // Flip the CURRENT step's own predicate false while it's on screen — must not crash, must land
    // on the nearest still-visible step (adjust-during-render, never a useEffect-driven navigation).
    fireEvent.click(screen.getByRole("button", { name: /hide me/i }));

    expect(screen.getByRole("heading", { name: "Step C" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Step B" })).not.toBeInTheDocument();
  });
});
