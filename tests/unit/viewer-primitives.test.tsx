import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile, MiniStat } from "@/components/character/stat-tile";
import { SectionCard, DefenseRow } from "@/components/character/section-card";
import { SeverityPill } from "@/components/character/severity-pill";

function DummyIcon({ className }: { className?: string }) {
  return <svg data-testid="dummy-icon" className={className} />;
}

describe("StatTile", () => {
  it("renders label, value, and sub", () => {
    render(<StatTile icon={DummyIcon} label="Armor Class" value={18} sub="Touch 12 · FF 16" />);
    expect(screen.getByText("Armor Class")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Touch 12 · FF 16")).toBeInTheDocument();
  });

  it("omits the sub line when not provided", () => {
    render(<StatTile icon={DummyIcon} label="Initiative" value="+3" />);
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.queryByText(/touch/i)).not.toBeInTheDocument();
  });

  it.each([
    ["gold", "text-gold"],
    ["rune", "text-rune"],
    ["danger", "text-danger"],
  ] as const)("applies the %s accent class to the value", (accent, expectedClass) => {
    render(<StatTile icon={DummyIcon} label="Speed" value="30 ft" accent={accent} />);
    expect(screen.getByText("30 ft")).toHaveClass(expectedClass);
  });

  it("defaults the value to the plain foreground color with no accent", () => {
    render(<StatTile icon={DummyIcon} label="Speed" value="30 ft" />);
    expect(screen.getByText("30 ft")).toHaveClass("text-foreground");
  });
});

describe("MiniStat", () => {
  it("renders the label and value on the raised background by default", () => {
    render(<MiniStat label="BAB" value="+5" />);
    expect(screen.getByText("BAB")).toBeInTheDocument();
    const value = screen.getByText("+5");
    expect(value.parentElement).toHaveClass("bg-surface-raised");
  });

  it("uses a transparent background when subtle", () => {
    render(<MiniStat label="CMB" value="+7" subtle />);
    const value = screen.getByText("+7");
    expect(value.parentElement).toHaveClass("bg-transparent");
    expect(value.parentElement).not.toHaveClass("bg-surface-raised");
  });
});

describe("SectionCard", () => {
  it("derives the heading id from the title and exposes an aria-labelledby region landmark", () => {
    render(
      <SectionCard title="Ability Scores" icon={DummyIcon}>
        <p>child content</p>
      </SectionCard>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: /ability scores/i });
    expect(heading).toHaveAttribute("id", "sec-ability-scores");
    const region = screen.getByRole("region", { name: /ability scores/i });
    expect(region.tagName).toBe("SECTION");
    expect(region).toHaveAttribute("aria-labelledby", "sec-ability-scores");
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("renders no accent bar by default", () => {
    render(
      <SectionCard title="Combat" icon={DummyIcon}>
        <p>content</p>
      </SectionCard>,
    );
    const region = screen.getByRole("region", { name: /combat/i });
    // section -> CardContent div -> Card div
    const card = region.parentElement?.parentElement;
    expect(card).not.toHaveClass("border-l-gold");
    expect(card).not.toHaveClass("border-l-2");
  });

  it("renders the gold left accent bar when accent is true", () => {
    render(
      <SectionCard title="Combat" icon={DummyIcon} accent>
        <p>content</p>
      </SectionCard>,
    );
    const region = screen.getByRole("region", { name: /combat/i });
    const card = region.parentElement?.parentElement;
    expect(card).toHaveClass("border-l-2");
    expect(card).toHaveClass("border-l-gold");
  });
});

describe("DefenseRow", () => {
  it("renders the label and value", () => {
    render(<DefenseRow label="DR" value="5/magic" />);
    expect(screen.getByText("DR")).toBeInTheDocument();
    expect(screen.getByText("5/magic")).toBeInTheDocument();
  });
});

describe("SeverityPill", () => {
  it.each([
    ["success", "border-success/35"],
    ["warning", "border-warning/35"],
    ["danger", "border-danger/35"],
    ["info", "border-rune/35"],
  ] as const)("renders the %s tone with the matching Badge variant classes", (tone, expectedClass) => {
    render(<SeverityPill tone={tone} label="Clean sections" />);
    expect(screen.getByText("Clean sections")).toHaveClass(expectedClass);
  });

  it("renders a bold count when provided", () => {
    render(<SeverityPill tone="warning" label="Warnings" count={2} />);
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("omits the count element when not provided", () => {
    render(<SeverityPill tone="danger" label="Flagged" />);
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByText("Flagged").textContent).toBe("Flagged");
  });
});
