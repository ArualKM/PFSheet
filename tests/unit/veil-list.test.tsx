import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { VeilList } from "@/components/character/veil-list";

type AkashicVm = NonNullable<CharacterViewModel["akashic"]>;

/**
 * The read-view veil list joins shaped rows to their veil detail by STABLE id (shaped.veilId →
 * veil.id) — a pure name join collided on same-named veils (two default-named customs, or a
 * custom renamed to match a compendium veil): the last-wins name Map showed the WRONG detail and
 * the name-keyed exclusion silently dropped the unshaped duplicate from "Known, not shaped".
 */
const vmVeil = (
  over: Partial<AkashicVm["veils"][number]> & { id: string; name: string },
): AkashicVm["veils"][number] => ({
  slots: [],
  ...over,
});

const vmShaped = (
  over: Partial<AkashicVm["shaped"][number]> & { id: string; veilId: string; name: string },
): AkashicVm["shaped"][number] => ({
  slot: "",
  essenceInvested: 0,
  bound: false,
  bindValid: true,
  overCapacity: false,
  enabled: true,
  saveDc: 10,
  ...over,
});

const akashicVm = (veils: AkashicVm["veils"], shapedRows: AkashicVm["shaped"]): AkashicVm => ({
  essence: { total: 5, invested: 1, available: 4, temporary: 0, capacityCap: 1 },
  classes: [],
  shaped: shapedRows,
  veilsKnownCount: veils.length,
  warnings: [],
  veils,
});

describe("VeilList — id-keyed shaped↔detail join", () => {
  it("same-named veils don't collide: the unshaped duplicate still renders and the shaped row shows ITS OWN detail", () => {
    const akashic = akashicVm(
      [
        vmVeil({ id: "v1", name: "New veil", effect: "The SHAPED variant's effect" }),
        vmVeil({ id: "v2", name: "New veil", effect: "The homebrew variant's effect" }),
      ],
      [vmShaped({ id: "s1", veilId: "v1", name: "New veil" })],
    );
    render(<VeilList akashic={akashic} />);
    // The unshaped same-named veil is NOT swallowed by the name-keyed exclusion — it's in the
    // "Known, not shaped" group (which wouldn't render at all under the old name join).
    fireEvent.click(screen.getByRole("button", { name: /known, not shaped/i }));
    expect(screen.getAllByText("New veil")).toHaveLength(2);
    // The shaped row's expandable detail is the veil it actually shapes (v1), not the name-map
    // last-wins entry (v2). Only the shaped row's button carries the DC text.
    fireEvent.click(screen.getByRole("button", { name: /DC 10/ }));
    expect(screen.getByText("The SHAPED variant's effect")).toBeTruthy();
    expect(screen.queryByText("The homebrew variant's effect")).toBeNull();
  });

  it("falls back to the name join for legacy shaped rows whose veilId no longer resolves", () => {
    const akashic = akashicVm(
      [vmVeil({ id: "v9", name: "Armory of the Conqueror", effect: "Summon a weapon of akasha" })],
      [vmShaped({ id: "s1", veilId: "gone", name: "Armory of the Conqueror" })],
    );
    render(<VeilList akashic={akashic} />);
    // Resolved by name → the veil counts as shaped (no "Known, not shaped" group)…
    expect(screen.queryByText("Known, not shaped")).toBeNull();
    // …and the shaped row still expands to its detail.
    fireEvent.click(screen.getByRole("button", { name: /DC 10/ }));
    expect(screen.getByText("Summon a weapon of akasha")).toBeTruthy();
  });
});
