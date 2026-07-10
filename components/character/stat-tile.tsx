import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Extracted from character-dashboard.tsx (S6 Pillar 4, byte-identical extraction — see
// docs/S6_UX_OVERHAUL/04_VIEWERS_DESIGN_LANGUAGE.md §5 item 2) so Classic, the public-share hero
// band, and the GM audit strip can import the identical tile instead of drifting copies.

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "gold" | "rune" | "danger";
}) {
  const accentClass =
    accent === "gold" ? "text-gold" : accent === "rune" ? "text-rune" : accent === "danger" ? "text-danger" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </div>
        <div className={cn("tnum text-2xl font-semibold", accentClass)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function MiniStat({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string | number;
  subtle?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border p-3 text-center", subtle ? "bg-transparent" : "bg-surface-raised")}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tnum text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
