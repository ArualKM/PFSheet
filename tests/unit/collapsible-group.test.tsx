import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { CollapsibleGroup } from "@/components/character/collapsible-group";

afterEach(cleanup);

const body = <p>hidden body</p>;

describe("CollapsibleGroup — forceOpen escape hatch", () => {
  it("stays collapsed when defaultOpen is false and forceOpen is false", () => {
    render(
      <CollapsibleGroup title="Cantrips" count={20} defaultOpen={false} forceOpen={false}>
        {body}
      </CollapsibleGroup>,
    );
    expect(screen.queryByText("hidden body")).toBeNull();
    expect(screen.getByRole("button", { name: /Cantrips/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("mounts open when forceOpen is already true even if defaultOpen is false", () => {
    render(
      <CollapsibleGroup title="Cantrips" count={20} defaultOpen={false} forceOpen>
        {body}
      </CollapsibleGroup>,
    );
    expect(screen.getByText("hidden body")).toBeTruthy();
  });

  it("opens when forceOpen transitions false -> true (the add-into-collapsed-group flow)", () => {
    const { rerender } = render(
      <CollapsibleGroup title="Cantrips" count={20} defaultOpen={false} forceOpen={false}>
        {body}
      </CollapsibleGroup>,
    );
    expect(screen.queryByText("hidden body")).toBeNull();
    act(() => {
      rerender(
        <CollapsibleGroup title="Cantrips" count={21} defaultOpen={false} forceOpen>
          {body}
        </CollapsibleGroup>,
      );
    });
    expect(screen.getByText("hidden body")).toBeTruthy();
  });

  it("preserves a manual collapse while forceOpen stays true (effect only fires on change-to-true)", () => {
    const { rerender } = render(
      <CollapsibleGroup title="Cantrips" count={21} defaultOpen={false} forceOpen>
        {body}
      </CollapsibleGroup>,
    );
    // Force-opened: body visible.
    expect(screen.getByText("hidden body")).toBeTruthy();
    // User manually collapses.
    act(() => {
      screen.getByRole("button", { name: /Cantrips/i }).click();
    });
    expect(screen.queryByText("hidden body")).toBeNull();
    // A re-render with forceOpen STILL true must not re-open it (no re-fire on unchanged value).
    act(() => {
      rerender(
        <CollapsibleGroup title="Cantrips" count={21} defaultOpen={false} forceOpen>
          {body}
        </CollapsibleGroup>,
      );
    });
    expect(screen.queryByText("hidden body")).toBeNull();
  });
});
