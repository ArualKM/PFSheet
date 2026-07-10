import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Extracted from character-dashboard.tsx (S6 Pillar 4, byte-identical extraction — see
// docs/S6_UX_OVERHAUL/04_VIEWERS_DESIGN_LANGUAGE.md §5 item 3) so Classic, the public-share hero
// band, and the GM audit strip can import the identical section shell instead of drifting copies.

export function SectionCard({
  title,
  icon: Icon,
  accent,
  className,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Additive, currently unused by existing call sites (default absent keeps today's output
   * byte-identical). When true, renders the mockup's `.accent-card` gold left bar
   * (`docs/S6_UX_OVERHAUL/mockups/viewer.html`) for "the thing that matters most right now" —
   * e.g. the read-view's Combat card. Restyling call sites to use it is a later slice.
   */
  accent?: boolean;
  /**
   * Additive passthrough onto the underlying `<Card>` (S6 Pillar 4 slice V2 — lets call sites
   * layer their own tint/hover treatment, e.g. `companion-sheet.tsx`'s gold-tinted "Grants to
   * Master" card or the dashboard's `pf-hover-lift` on clickable cards, without a bespoke
   * SectionCard fork). Merged after `accent`'s border classes via `cn`, so a caller-supplied
   * className can still win on conflicting utilities.
   */
  className?: string;
  children: ReactNode;
}) {
  // A <section> named by its heading is a region landmark — screen-reader users can jump
  // between sheet sections, and the heading is programmatically associated with its content.
  const headingId = `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <Card className={cn(accent && "border-l-2 border-l-gold", className)}>
      <CardContent className="p-5">
        <section aria-labelledby={headingId}>
          <h2
            id={headingId}
            className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <Icon className="size-4 text-gold" /> {title}
          </h2>
          {children}
        </section>
      </CardContent>
    </Card>
  );
}

export function DefenseRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
