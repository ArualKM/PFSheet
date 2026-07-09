import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SheetViewSwitch } from "@/components/character/sheet-view-switch";

afterEach(cleanup);

const CHAR_ID = "char-1";
const GLOBAL_KEY = "pf:sheetView";
const charKey = (id: string) => `pf:sheetView:${id}`;

const modern = <div>modern-marker</div>;
const classic = <div>classic-marker</div>;
const companionView = <div>companion-marker</div>;

describe("SheetViewSwitch", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("legacy 2-prop call: renders modern, exactly 2 pills, clicking Classic swaps + persists both keys", () => {
    render(<SheetViewSwitch characterId={CHAR_ID} modern={modern} classic={classic} />);

    expect(screen.getByText("modern-marker")).toBeTruthy();
    expect(screen.queryByText("classic-marker")).toBeNull();

    const pills = screen.getAllByRole("button");
    expect(pills).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /classic/i }));

    expect(screen.getByText("classic-marker")).toBeTruthy();
    expect(screen.queryByText("modern-marker")).toBeNull();
    expect(localStorage.getItem(charKey(CHAR_ID))).toBe("classic");
    expect(localStorage.getItem(GLOBAL_KEY)).toBe("classic");
  });

  it("companion + defaultView=companion: renders companion content on first render, 3 pills, Companion pressed", () => {
    render(
      <SheetViewSwitch
        characterId={CHAR_ID}
        modern={modern}
        classic={classic}
        companion={companionView}
        defaultView="companion"
      />,
    );

    expect(screen.getByText("companion-marker")).toBeTruthy();
    expect(screen.queryByText("modern-marker")).toBeNull();
    expect(screen.queryByText("classic-marker")).toBeNull();

    const pills = screen.getAllByRole("button");
    expect(pills).toHaveLength(3);

    expect(screen.getByRole("button", { name: /companion/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("per-character stored 'modern' beats defaultView=companion after mount", () => {
    localStorage.setItem(charKey(CHAR_ID), "modern");

    render(
      <SheetViewSwitch
        characterId={CHAR_ID}
        modern={modern}
        classic={classic}
        companion={companionView}
        defaultView="companion"
      />,
    );

    expect(screen.getByText("modern-marker")).toBeTruthy();
    expect(screen.queryByText("companion-marker")).toBeNull();
  });

  it("global 'classic' does NOT override the companion default", () => {
    localStorage.setItem(GLOBAL_KEY, "classic");

    render(
      <SheetViewSwitch
        characterId={CHAR_ID}
        modern={modern}
        classic={classic}
        companion={companionView}
        defaultView="companion"
      />,
    );

    expect(screen.getByText("companion-marker")).toBeTruthy();
    expect(screen.queryByText("classic-marker")).toBeNull();
  });

  it("stored per-char 'companion' without a companion prop is ignored (modern shown, no crash)", () => {
    localStorage.setItem(charKey(CHAR_ID), "companion");

    render(<SheetViewSwitch characterId={CHAR_ID} modern={modern} classic={classic} />);

    expect(screen.getByText("modern-marker")).toBeTruthy();
    expect(screen.queryByText("classic-marker")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("choosing companion writes only the per-character key; choosing classic afterwards writes both", () => {
    render(
      <SheetViewSwitch
        characterId={CHAR_ID}
        modern={modern}
        classic={classic}
        companion={companionView}
        defaultView="modern"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /companion/i }));
    expect(screen.getByText("companion-marker")).toBeTruthy();
    expect(localStorage.getItem(charKey(CHAR_ID))).toBe("companion");
    expect(localStorage.getItem(GLOBAL_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^classic$/i }));
    expect(screen.getByText("classic-marker")).toBeTruthy();
    expect(localStorage.getItem(charKey(CHAR_ID))).toBe("classic");
    expect(localStorage.getItem(GLOBAL_KEY)).toBe("classic");
  });
});
