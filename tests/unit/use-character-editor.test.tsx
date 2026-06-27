import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";

// Mock only the server action; the merge/compute/parse logic runs for real.
const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("@/lib/actions/characters", () => ({ saveCharacterSheetAction: saveMock }));

import { useCharacterEditor } from "@/components/character/editor/use-character-editor";

function withName(base: PathForgeCharacterV1, name: string): PathForgeCharacterV1 {
  const c = structuredClone(base);
  c.identity.name = name;
  return c;
}

// Pump fake timers + the fire-and-forget save loop's microtasks until everything settles.
// (waitFor can't be used here: it polls on real timers, which never advance under fake timers.)
async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

describe("useCharacterEditor — version-guarded save + conflict handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves an edit with the base version and advances on success", async () => {
    saveMock.mockResolvedValue({ ok: true, version: 2 });
    const base = createDefaultCharacter({ name: "A" });
    const { result } = renderHook(() => useCharacterEditor("c1", base, 1));

    act(() => result.current.update((d) => void (d.identity.name = "B")));
    expect(result.current.status).toBe("unsaved");

    await settle();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenLastCalledWith("c1", expect.objectContaining({ identity: expect.objectContaining({ name: "B" }) }), 1);
    expect(result.current.status).toBe("saved");
  });

  it("an edit made during an in-flight save is not lost", async () => {
    const base = createDefaultCharacter({ name: "A" });
    let release: (v: unknown) => void = () => {};
    saveMock
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValue({ ok: true, version: 3 });

    const { result } = renderHook(() => useCharacterEditor("c1", base, 1));
    act(() => result.current.update((d) => void (d.identity.name = "B")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950); // first save fires and hangs
      await Promise.resolve();
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saving");

    // User keeps typing while the first save is in flight.
    act(() => result.current.update((d) => void (d.identity.name = "C")));
    await act(async () => {
      release({ ok: true, version: 2 });
    });
    await settle();

    // The "C" edit must have been re-saved — not silently dropped.
    expect(saveMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const sawC = saveMock.mock.calls.some((c) => (c[1] as PathForgeCharacterV1)?.identity?.name === "C");
    expect(sawC).toBe(true);
    expect(result.current.status).toBe("saved");
    expect(result.current.draft.identity.name).toBe("C");
  });

  it("auto-merges a disjoint concurrent change with no conflict banner", async () => {
    const base = createDefaultCharacter({ name: "A" });
    const serverSheet = structuredClone(base);
    serverSheet.identity.alignment = "CG"; // other device changed alignment; we change name
    saveMock
      .mockResolvedValueOnce({ ok: false, conflict: { serverSheet, serverVersion: 7 } })
      .mockResolvedValueOnce({ ok: true, version: 8 });

    const { result } = renderHook(() => useCharacterEditor("c1", base, 1));
    act(() => result.current.update((d) => void (d.identity.name = "B")));
    await settle();

    expect(result.current.status).toBe("saved");
    expect(result.current.conflict).toBeNull();
    expect(result.current.draft.identity.name).toBe("B");
    expect(result.current.draft.identity.alignment).toBe("CG");
    expect(saveMock).toHaveBeenLastCalledWith("c1", expect.anything(), 7); // re-saved at server version
  });

  it("surfaces a true same-field conflict for the user to resolve", async () => {
    const base = createDefaultCharacter({ name: "A" });
    const serverSheet = withName(base, "ServerName");
    saveMock.mockResolvedValueOnce({ ok: false, conflict: { serverSheet, serverVersion: 9 } });

    const { result } = renderHook(() => useCharacterEditor("c1", base, 1));
    act(() => result.current.update((d) => void (d.identity.name = "MyName")));
    await settle();

    expect(result.current.status).toBe("conflict");
    expect(result.current.conflict).not.toBeNull();
    expect(result.current.conflict?.conflicts.some((c) => c.path === "identity.name")).toBe(true);

    act(() => result.current.resolveConflict("theirs"));
    expect(result.current.conflict).toBeNull();
    expect(result.current.draft.identity.name).toBe("ServerName");
  });
});
