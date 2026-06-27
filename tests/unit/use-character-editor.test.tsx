import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import { applyConflictChoices } from "@/lib/character/merge";
import { readOutbox, writeOutbox } from "@/lib/character/outbox";

// Mock only the server action; the merge/compute/parse logic runs for real.
const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("@/lib/actions/characters", () => ({ saveCharacterSheetAction: saveMock }));

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}

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
    localStorage.clear();
    setOnline(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
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

    // Resolve by taking the server's value for the name (per-field choice → resolved doc).
    const cf = result.current.conflict!;
    const resolved = applyConflictChoices(cf.merged, cf.conflicts, { "identity.name": "theirs" });
    act(() => result.current.resolveConflict(resolved));
    expect(result.current.conflict).toBeNull();
    expect(result.current.draft.identity.name).toBe("ServerName");
  });

  it("recovers from a hung save instead of sticking forever on 'unsaved'", async () => {
    // The save never settles (a stalled connection / wedged server action). Before the timeout fix
    // this left savingRef stuck true → the editor was permanently stuck on "unsaved" with no retry.
    saveMock.mockImplementation(() => new Promise(() => {}));
    const base = createDefaultCharacter({ name: "A" });
    const { result } = renderHook(() => useCharacterEditor("c-hang", base, 1));

    act(() => result.current.update((d) => void (d.identity.name = "B")));
    // Debounce fires the save (hangs); the 20s save-timeout then trips and we fall through to the
    // durable offline queue — releasing the loop rather than wedging it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900 + 20000 + 1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    });

    expect(saveMock).toHaveBeenCalled();
    expect(result.current.status).toBe("offline"); // recovered to a retryable state, not stuck
    expect(readOutbox("c-hang")?.sheet.identity.name).toBe("B"); // draft preserved, no data loss

    // The loop is NOT permanently held: a later successful save goes through on reconnect.
    saveMock.mockResolvedValue({ ok: true, version: 2 });
    await act(async () => void window.dispatchEvent(new Event("online")));
    await settle();
    expect(result.current.status).toBe("saved");
  });

  it("queues an edit offline and flushes it on reconnect", async () => {
    setOnline(false);
    saveMock.mockResolvedValue({ ok: true, version: 2 });
    const base = createDefaultCharacter({ name: "A" });
    const { result } = renderHook(() => useCharacterEditor("c-off", base, 1));

    act(() => result.current.update((d) => void (d.identity.name = "Offline")));
    await settle();

    expect(result.current.status).toBe("offline");
    expect(saveMock).not.toHaveBeenCalled();
    expect(readOutbox("c-off")?.sheet.identity.name).toBe("Offline");

    // Reconnect → the queued draft flushes through the normal CAS save.
    setOnline(true);
    await act(async () => void window.dispatchEvent(new Event("online")));
    await settle();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
    expect(readOutbox("c-off")).toBeNull(); // cleared once safely on the server
  });

  it("restores a draft queued offline in a previous session on mount", async () => {
    const base = createDefaultCharacter({ name: "A" });
    writeOutbox("c-hyd", {
      sheet: withName(base, "FromLastSession"),
      baseSheet: base,
      baseVersion: 1,
      schemaVersion: base.schemaVersion,
      savedAt: 1,
    });
    saveMock.mockResolvedValue({ ok: true, version: 2 });

    const { result } = renderHook(() => useCharacterEditor("c-hyd", base, 1));
    await settle();

    expect(result.current.draft.identity.name).toBe("FromLastSession");
    expect(saveMock).toHaveBeenCalled();
    expect(result.current.status).toBe("saved");
  });

  it("discards a queued draft from an older schema instead of feeding it to the engine", async () => {
    const base = createDefaultCharacter({ name: "A" });
    writeOutbox("c-stale", {
      sheet: withName(base, "Stale"),
      baseSheet: base,
      baseVersion: 1,
      schemaVersion: "pathforge-character-OLD",
      savedAt: 1,
    });
    saveMock.mockResolvedValue({ ok: true, version: 2 });

    const { result } = renderHook(() => useCharacterEditor("c-stale", base, 1));
    await settle();

    // The stale entry is dropped; the editor shows the freshly-loaded server sheet, no crash.
    expect(result.current.draft.identity.name).toBe("A");
    expect(readOutbox("c-stale")).toBeNull();
    expect(result.current.status).toBe("saved");
    expect(saveMock).not.toHaveBeenCalled();
  });
});
