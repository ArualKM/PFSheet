import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { DeleteCharacterDialog } from "@/components/character/delete-character-dialog";

const { deleteMock } = vi.hoisted(() => ({ deleteMock: vi.fn() }));
vi.mock("@/lib/actions/characters", () => ({ deleteCharacterAction: deleteMock }));

afterEach(cleanup);

function open() {
  fireEvent.click(screen.getByRole("button", { name: /delete character/i }));
}

describe("DeleteCharacterDialog", () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  it("starts collapsed: only the small destructive trigger is visible, no confirm panel", () => {
    render(<DeleteCharacterDialog characterId="c1" characterName="Elandra" />);

    expect(screen.getByRole("button", { name: /delete character/i })).toBeTruthy();
    expect(screen.queryByLabelText(/type the character's name to confirm deletion/i)).toBeNull();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("expands into the confirm panel on click, with the warning copy", () => {
    render(<DeleteCharacterDialog characterId="c1" characterName="Elandra" />);
    open();

    expect(screen.getByText(/permanently deletes/i)).toBeTruthy();
    expect(screen.getAllByText("Elandra").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/type the character's name to confirm deletion/i)).toBeTruthy();
  });

  it("shows the linked-companion warning only when companionCount > 0, with correct pluralization", () => {
    render(<DeleteCharacterDialog characterId="c1" characterName="Elandra" companionCount={0} />);
    open();
    expect(screen.queryByText(/linked companion/i)).toBeNull();

    cleanup();
    render(<DeleteCharacterDialog characterId="c1" characterName="Elandra" companionCount={1} />);
    open();
    expect(screen.getByText(/1 linked companion will be unlinked, not deleted\./i)).toBeTruthy();

    cleanup();
    render(<DeleteCharacterDialog characterId="c1" characterName="Elandra" companionCount={3} />);
    open();
    expect(screen.getByText(/3 linked companions will be unlinked, not deleted\./i)).toBeTruthy();
  });

  it("confirm button is disabled until the typed name matches (trimmed, case-sensitive)", () => {
    render(<DeleteCharacterDialog characterId="c1" characterName="Elandra" />);
    open();

    const input = screen.getByLabelText(/type the character's name to confirm deletion/i);
    const confirmBtn = screen.getByRole("button", { name: /permanently delete/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "Elan" } });
    expect(confirmBtn).toBeDisabled();

    // Case mismatch must NOT satisfy the check.
    fireEvent.change(input, { target: { value: "elandra" } });
    expect(confirmBtn).toBeDisabled();

    // Trailing CONTENT must NOT satisfy the check.
    fireEvent.change(input, { target: { value: "Elandras" } });
    expect(confirmBtn).toBeDisabled();

    // Trailing WHITESPACE is tolerated — both sides compare trimmed, matching the
    // server's check exactly (review: the old client-exact/server-trimmed asymmetry
    // made whitespace-padded input pass the server but never enable this button).
    fireEvent.change(input, { target: { value: "Elandra " } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.change(input, { target: { value: "Elandra" } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("a whitespace-padded STORED name is still deletable (compared trimmed on both sides)", () => {
    render(<DeleteCharacterDialog characterId="c1" characterName="  Elandra  " />);
    open();

    const confirmBtn = screen.getByRole("button", { name: /permanently delete/i });
    // The label shows the trimmed target, and typing it satisfies the gate.
    fireEvent.change(screen.getByLabelText(/type the character's name to confirm deletion/i), {
      target: { value: "Elandra" },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("a blank-named character falls back to typing DELETE (review HIGH: was logically undeletable)", () => {
    render(<DeleteCharacterDialog characterId="c1" characterName="   " />);
    open();

    // The label prompts for the literal fallback token, not an empty name.
    expect(screen.getByText("DELETE")).toBeTruthy();

    const input = screen.getByLabelText(/type the character's name to confirm deletion/i);
    const confirmBtn = screen.getByRole("button", { name: /permanently delete/i });
    expect(confirmBtn).toBeDisabled();

    // Case-sensitive: the lowercase word must not arm the button.
    fireEvent.change(input, { target: { value: "delete" } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("clicking confirm with an exact match calls deleteCharacterAction with the characterId + typed name", async () => {
    deleteMock.mockResolvedValue({ ok: true });
    render(<DeleteCharacterDialog characterId="char-42" characterName="Elandra" />);
    open();

    const input = screen.getByLabelText(/type the character's name to confirm deletion/i);
    fireEvent.change(input, { target: { value: "Elandra" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /permanently delete/i }));
    });

    expect(deleteMock).toHaveBeenCalledWith("char-42", "Elandra");
  });

  it("clicking confirm while mismatched is a no-op (guards against a stale-disabled click)", async () => {
    render(<DeleteCharacterDialog characterId="char-42" characterName="Elandra" />);
    open();

    // The button IS disabled, but exercise the handler's own guard directly by
    // firing the click anyway — disabled buttons don't dispatch click in jsdom,
    // so this doubles as proof the DOM-level disabled state holds.
    fireEvent.click(screen.getByRole("button", { name: /permanently delete/i }));
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("surfaces a server error returned by the action instead of navigating away", async () => {
    deleteMock.mockResolvedValue({ ok: false, error: "The typed name doesn't match — delete cancelled." });
    render(<DeleteCharacterDialog characterId="char-42" characterName="Elandra" />);
    open();

    fireEvent.change(screen.getByLabelText(/type the character's name to confirm deletion/i), {
      target: { value: "Elandra" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /permanently delete/i }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/delete cancelled/i);
    // The panel stays open (no redirect happened) so the user can retry.
    expect(screen.getByLabelText(/type the character's name to confirm deletion/i)).toBeTruthy();
  });

  it("Cancel collapses the panel and resets the typed value + error", () => {
    render(<DeleteCharacterDialog characterId="c1" characterName="Elandra" />);
    open();

    fireEvent.change(screen.getByLabelText(/type the character's name to confirm deletion/i), {
      target: { value: "Elandra" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByLabelText(/type the character's name to confirm deletion/i)).toBeNull();
    expect(screen.getByRole("button", { name: /delete character/i })).toBeTruthy();

    // Re-opening starts fresh (typed value did not persist).
    open();
    const input = screen.getByLabelText(/type the character's name to confirm deletion/i) as HTMLInputElement;
    expect(input.value).toBe("");
  });
});
