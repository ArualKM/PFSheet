import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { createDefaultCharacter, type PathForgeCharacterV1, type EquipmentItem } from "@pathforge/schema";

// Items Overhaul Stage 3 — the inventory editor. Harness preamble copied from
// tests/unit/wizard-steps.test.tsx: window.matchMedia/ResizeObserver + the Supabase client mock are
// defensive (InventoryEditor itself touches neither today), matching the standard editor-test setup
// used across this suite so the harness stays interchangeable with other editor tests.
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
import { InventoryEditor } from "@/components/character/editor/inventory-editor";
import { SectionSummary } from "@/components/character/editor/section-summary";
import { formatModifier } from "@/lib/utils";

/** Mounts a real `useCharacterEditor` and hands the live `ed` to a render-prop child. */
function Host({
  initial,
  onEd,
  children,
}: {
  initial: PathForgeCharacterV1;
  onEd: (ed: CharacterEditorApi) => void;
  children: (ed: CharacterEditorApi) => ReactNode;
}) {
  const ed = useCharacterEditor("inventory-slots-test", initial, 1);
  useEffect(() => {
    onEd(ed);
  });
  return <>{children(ed)}</>;
}

// Same fake-timer "pump the save loop" idiom as the other editor tests — real timers would leave the
// autosave debounce (900ms) dangling past the end of each test.
async function settle() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  });
}

function item(over: Partial<EquipmentItem> & { id: string; name: string }): EquipmentItem {
  return {
    category: "gear",
    quantity: 1,
    equipped: false,
    automation: [],
    modifiers: [],
    identified: true,
    ...over,
  } as EquipmentItem;
}

function fixtureWithRing(): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Pack Rat" });
  c.inventory.potionsScrollsMagicItems.push(
    item({ id: "ring1", name: "Ring of Protection", category: "magic_item" }),
  );
  return c;
}

function findRing(ed: CharacterEditorApi) {
  return ed.draft.inventory.potionsScrollsMagicItems.find((i) => i.id === "ring1");
}

describe("InventoryEditor — Stage 3 (slots, wondrous, linked-attack)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset().mockResolvedValue({ ok: true, version: 2 });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("setting a Slot select writes equipSlot", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixtureWithRing()} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /edit ring of protection details/i }));
    await settle();

    fireEvent.change(screen.getByLabelText("Slot"), { target: { value: "belt" } });
    await settle();

    expect(findRing(latestEd!)?.equipSlot).toBe("belt");
  });

  it("Other… free-text writes a custom slot string (never rejected)", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixtureWithRing()} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /edit ring of protection details/i }));
    await settle();

    // "__other__" is the internal sentinel InventoryEditor's SlotSelect uses for its "Other…" option.
    fireEvent.change(screen.getByLabelText("Slot"), { target: { value: "__other__" } });
    await settle();

    fireEvent.change(screen.getByLabelText("Slot (custom)"), { target: { value: "storm chakra" } });
    await settle();

    expect(findRing(latestEd!)?.equipSlot).toBe("storm chakra");
  });

  it("wondrous fields write, lazily create the block, and clean-delete it once cleared", async () => {
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={fixtureWithRing()} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /edit ring of protection details/i }));
    await settle();

    expect(findRing(latestEd!)?.wondrous).toBeUndefined();

    fireEvent.change(screen.getByLabelText("Aura school"), { target: { value: "abjuration" } });
    await settle();
    expect(findRing(latestEd!)?.wondrous?.auraSchool).toBe("abjuration");

    fireEvent.change(screen.getByLabelText("Caster level"), { target: { value: "5" } });
    await settle();
    expect(findRing(latestEd!)?.wondrous?.casterLevel).toBe(5);

    // Clear both fields back out — the object must disappear entirely, not linger as {}.
    fireEvent.change(screen.getByLabelText("Aura school"), { target: { value: "" } });
    await settle();
    fireEvent.change(screen.getByLabelText("Caster level"), { target: { value: "0" } });
    await settle();

    expect(findRing(latestEd!)?.wondrous).toBeUndefined();
  });

  it("the wondrous disclosure stays OPEN after clearing its last field (never force-closes mid-edit)", async () => {
    // A <details open={derivedData}> is controlled — React snapped the panel shut the instant the
    // user cleared the only wondrous field (review finding). The disclosure may only force-OPEN.
    const c = fixtureWithRing();
    const ring = c.inventory.potionsScrollsMagicItems.find((g) => g.id === "ring1")!;
    ring.wondrous = { auraSchool: "abjuration" };
    render(
      <Host initial={c} onEd={() => {}}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /edit ring of protection details/i }));
    await settle();

    const auraField = screen.getByLabelText("Aura school");
    const details = auraField.closest("details")!;
    expect(details.open).toBe(true);

    fireEvent.change(auraField, { target: { value: "" } });
    await settle();

    // The block clean-deletes, but the panel the user is editing inside must NOT snap shut.
    expect(details.open).toBe(true);
  });

  it("editor doll panel is gated: hint on a slotless sheet, doll once slot activity exists", async () => {
    // The Stage-2 anti-pattern (an all-"Empty" 13-row doll on every pre-existing sheet) must not
    // reappear in the editor (review finding).
    const plain = fixtureWithRing(); // ring has no slot set
    const first = render(
      <Host initial={plain} onEd={() => {}}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();
    expect(screen.getByText(/assign a body slot on an equipped magic item/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Hands available")).not.toBeInTheDocument();
    first.unmount();

    const slotted = fixtureWithRing();
    const ring = slotted.inventory.potionsScrollsMagicItems.find((g) => g.id === "ring1")!;
    ring.equipped = true;
    ring.equipSlot = "ring_left";
    render(
      <Host initial={slotted} onEd={() => {}}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();
    expect(screen.queryByText(/assign a body slot on an equipped magic item/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Hands available")).toBeInTheDocument();
  });

  it("an equipped weapon-category item with an untouched weapon block gets an honest hint, not silence", async () => {
    const c = fixtureWithRing();
    c.inventory.weapons.push({
      id: "w-bare",
      name: "Bare Sword",
      category: "weapon",
      quantity: 1,
      equipped: true,
      automation: [],
      modifiers: [],
      identified: true,
      // NO weapon block — the lazily-created stats were never touched (review finding: this state
      // produced neither the linked-attack chip nor any hint).
    } as never);
    render(
      <Host initial={c} onEd={() => {}}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();
    expect(screen.getByText(/set weapon stats to link an attack/i)).toBeInTheDocument();
  });

  it("shows the live linked-attack chip for an equipped weapon, reading ed.computed.attacks", async () => {
    const c = createDefaultCharacter({ name: "Fighter" });
    c.inventory.weapons.push(
      item({
        id: "sword1",
        name: "Longsword +1",
        category: "weapon",
        equipped: true,
        weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 1, damageDice: "1d8" },
      }),
    );
    let latestEd: CharacterEditorApi | undefined;
    render(
      <Host initial={c} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();

    const atk = latestEd!.computed.attacks.find((a) => a.id === "pf:weapon:sword1");
    expect(atk).toBeTruthy();
    const expectedText = `${formatModifier(atk!.attackBonus)}${atk!.damage ? ` · ${atk!.damage}` : ""}`;
    expect(screen.getByText(expectedText)).toBeInTheDocument();

    // The hands chip (sourced from weapon.handed — one-handed grip here) is also present. "Hands" is
    // ambiguous by itself (it's also a body-slot label rendered by the SlotDoll overview above), so
    // scope to the one whose chip text is exactly "Hands1".
    const handsChip = screen.getAllByText("Hands").find((el) => el.parentElement?.textContent === "Hands1");
    expect(handsChip).toBeTruthy();
  });

  it("shows an 'equip to activate' hint instead of the linked-attack chip when the weapon isn't equipped", async () => {
    const c = createDefaultCharacter({ name: "Fighter" });
    c.inventory.weapons.push(
      item({
        id: "sword1",
        name: "Longsword +1",
        category: "weapon",
        equipped: false,
        weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 1, damageDice: "1d8" },
      }),
    );
    render(
      <Host initial={c} onEd={() => {}}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();

    expect(screen.getByText("equip to activate")).toBeInTheDocument();
    expect(screen.queryByText("Linked attack")).not.toBeInTheDocument();
  });

  it("handsAvailable writes inventory.settings.handsAvailable", async () => {
    let latestEd: CharacterEditorApi | undefined;
    // The doll panel (which hosts the field) is gated on slot activity — give the fixture an
    // equipped slotted ring so the panel renders (the gating itself is covered by its own test).
    const c = fixtureWithRing();
    const ring = c.inventory.potionsScrollsMagicItems.find((g) => g.id === "ring1")!;
    ring.equipped = true;
    ring.equipSlot = "ring_left";
    render(
      <Host initial={c} onEd={(ed) => (latestEd = ed)}>
        {(ed) => <InventoryEditor ed={ed} />}
      </Host>,
    );
    await settle();

    expect(latestEd!.draft.inventory.settings.handsAvailable).toBe(2);

    fireEvent.change(screen.getByLabelText("Hands available"), { target: { value: "4" } });
    await settle();

    expect(latestEd!.draft.inventory.settings.handsAvailable).toBe(4);
  });

  it("the summary chips show a warning count and a hands used/available chip when present", async () => {
    const c = createDefaultCharacter({ name: "Collision" });
    c.inventory.gear.push(
      item({ id: "belt1", name: "Belt A", category: "magic_item", equipSlot: "belt", equipped: true }),
      item({ id: "belt2", name: "Belt B", category: "magic_item", equipSlot: "belt", equipped: true }),
    );
    c.inventory.weapons.push(
      item({
        id: "sword1",
        name: "Sword",
        category: "weapon",
        equipped: true,
        weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0 },
      }),
    );
    render(
      <Host initial={c} onEd={() => {}}>
        {(ed) => <SectionSummary sectionKey="equipment" ed={ed} />}
      </Host>,
    );
    await settle();

    expect(screen.getByText("Warnings").parentElement?.textContent).toBe("Warnings1");
    expect(screen.getByText("Hands").parentElement?.textContent).toBe("Hands1/2");
  });

  it("does not show warnings/hands chips on a clean sheet with nothing equipped", async () => {
    render(
      <Host initial={createDefaultCharacter({ name: "Clean" })} onEd={() => {}}>
        {(ed) => <SectionSummary sectionKey="equipment" ed={ed} />}
      </Host>,
    );
    await settle();

    expect(screen.queryByText("Warnings")).not.toBeInTheDocument();
    expect(screen.queryByText("Hands")).not.toBeInTheDocument();
  });
});
