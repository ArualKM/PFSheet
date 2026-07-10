import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { ShareHero } from "@/components/character/share-hero";

function richCharacter() {
  const c = createDefaultCharacter({ name: "Anise Thorne", playerName: "Real Player Name" });
  c.identity.race = "Human";
  c.identity.classes = [{ id: "c1", name: "Wizard", level: 8 }];
  c.identity.totalLevel = 8;
  return c;
}

describe("ShareHero", () => {
  it("renders the character's name and AC from the gated view-model", () => {
    const c = richCharacter();
    const vm = buildCharacterViewModel(c, computeCharacter(c), "public", "public");
    render(<ShareHero vm={vm} />);

    expect(screen.getByText("Anise Thorne")).toBeInTheDocument();

    // Look up AC via its label's sibling rather than a bare getByText(number) — several vitals
    // (HP/Init/Fort/Ref/Will) could coincidentally share a digit on a fresh default character.
    const acLabel = screen.getByText("AC");
    expect(acLabel.parentElement).toHaveTextContent(String(vm.vitals.ac.total));
  });

  it("renders both CTAs at a 44px tap target, pointed at signup and the in-page anchor", () => {
    const c = richCharacter();
    const vm = buildCharacterViewModel(c, computeCharacter(c), "public", "public");
    render(<ShareHero vm={vm} />);

    const createLink = screen.getByRole("link", { name: /create your own character/i });
    expect(createLink).toHaveAttribute("href", "/signup");
    expect(createLink.className).toMatch(/tap-target/);

    // Plain anchor, no onClick/JS — a real <a href="#full-sheet">, not a client-side scroll handler.
    const viewFullLink = screen.getByRole("link", { name: /view full sheet/i });
    expect(viewFullLink.tagName).toBe("A");
    expect(viewFullLink).toHaveAttribute("href", "#full-sheet");
    expect(viewFullLink.className).toMatch(/tap-target/);
  });

  it("CRITICAL: never renders playerName (owner-only PII) for the public viewer — it isn't even in vm", () => {
    const c = richCharacter();
    const vm = buildCharacterViewModel(c, computeCharacter(c), "public", "public");

    // The gate itself: buildCharacterViewModel must not have handed a public viewer the real name.
    expect(vm.header.playerName).toBeUndefined();

    render(<ShareHero vm={vm} />);
    expect(screen.queryByText("Real Player Name")).not.toBeInTheDocument();
    expect(screen.queryByText(/played by/i)).not.toBeInTheDocument();
  });

  it("CRITICAL: the component itself only ever reads header/vitals — playerName stays absent even if the owner's own vm carries it", () => {
    const c = richCharacter();
    // Owner viewer: vm.header.playerName IS populated here (proves the gate is real)...
    const ownerVm = buildCharacterViewModel(c, computeCharacter(c), "owner", "public");
    expect(ownerVm.header.playerName).toBe("Real Player Name");

    // ...yet ShareHero, scoped to name/classLine/vitals only, never surfaces it even when present —
    // the component's own read surface is the second line of defense, not just the upstream gate.
    render(<ShareHero vm={ownerVm} />);
    expect(screen.queryByText("Real Player Name")).not.toBeInTheDocument();
  });

  it("renders unaffected by unrelated privacy hides — the hero only ever reads vitals/header", () => {
    const c = richCharacter();
    c.privacy.sections.abilities = "private";
    c.privacy.sections.feats = "private";
    c.privacy.sections.buffs = "private";
    c.privacy.sections.backstory = "private";
    const vm = buildCharacterViewModel(c, computeCharacter(c), "public", "public");

    render(<ShareHero vm={vm} />);
    expect(screen.getByText("Anise Thorne")).toBeInTheDocument();
    const acLabel = screen.getByText("AC");
    expect(acLabel.parentElement).toHaveTextContent(String(vm.vitals.ac.total));
  });
});
