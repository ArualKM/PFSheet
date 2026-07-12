import { EQUIP_SLOT_LABELS } from "@pathforge/schema";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EquipmentSlotsView, EquipmentSlotOccupantView } from "@/lib/character/view-model";

/**
 * Shared paper-doll slot map (Items Overhaul Stage 2, docs/ITEMS_OVERHAUL/MASTER_PLAN.md). Purely
 * presentational — props are serializable data only (no hooks, no function props) — so it's safe to
 * render from a Server Component (the read-view dashboard). A future interactive editor version
 * wraps this same shape in a thin "use client" shell that owns click/scroll state (Stage 3), per the
 * RSC-boundary discipline in CLAUDE.md (`[[pathforge-rsc-function-props]]`) — the read view itself
 * never needs handlers, a slot is just a fact here, not a control.
 *
 * Desktop shows a compact silhouette (status-at-a-glance, aria-hidden, no leader-line callouts —
 * that's Stage 3 editor territory) beside a slot list. Mobile drops the silhouette entirely
 * (`hidden … sm:block`) — the slot list is BOTH the sole mobile layout AND the doll's accessible
 * representation, per the plan's mobile-first honesty ("a 13-point silhouette does not survive to a
 * 375px viewport").
 */

/** Fixed anatomical order for the slot list (head → … → feet), per the plan's mobile slot-list spec. */
export const SLOT_DISPLAY_ORDER = [
  "head",
  "headband",
  "eyes",
  "neck",
  "shoulders",
  "body",
  "chest",
  "wrist",
  "hands",
  "belt",
  "ring_left",
  "ring_right",
  "feet",
] as const;

/** "belt_of_giants" → "Belt Of Giants" — fallback label for a homebrew slot string not present in
 * EQUIP_SLOT_LABELS. Mirrors the engine's private titleCase in equipment-slots.ts — never silently
 * dropped from the doll/list (the plan's "homebrew slot names never rendering" risk). */
function titleCaseSlot(raw: string): string {
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

export function slotLabel(slot: string): string {
  return EQUIP_SLOT_LABELS[slot] ?? titleCaseSlot(slot);
}

// Percentage coordinates (of the 300x460 doll viewBox) for each of the 13 known slots — lifted 1:1
// from docs/ITEMS_OVERHAUL/mockups/item-slots.html's `.slot-dot` positions.
const SLOT_POSITIONS: Record<string, { left: number; top: number }> = {
  head: { left: 56.67, top: 4.78 },
  headband: { left: 43.33, top: 8.7 },
  eyes: { left: 56.67, top: 11.3 },
  neck: { left: 43.33, top: 16.96 },
  shoulders: { left: 56.67, top: 20 },
  chest: { left: 43.33, top: 27.83 },
  body: { left: 56.67, top: 36.52 },
  wrist: { left: 30, top: 35.87 },
  hands: { left: 70.67, top: 53.26 },
  belt: { left: 50, top: 44.78 },
  ring_left: { left: 29.33, top: 56.09 },
  ring_right: { left: 70.67, top: 56.96 },
  feet: { left: 50, top: 94.57 },
};

function occupancy(occupants: EquipmentSlotOccupantView[]): { count: number; text: string } {
  const count = occupants.reduce((sum, o) => sum + o.quantity, 0);
  const text = occupants.map((o) => (o.quantity > 1 ? `${o.name} ×${o.quantity}` : o.name)).join(", ");
  return { count, text };
}

function dotClass(count: number): string {
  if (count > 1) return "border-danger bg-danger";
  if (count === 1) return "border-gold bg-gold";
  return "border-border bg-surface-sunken";
}

export function SlotDoll({ slots, className }: { slots: EquipmentSlotsView; className?: string }) {
  const known = new Set<string>(SLOT_DISPLAY_ORDER);
  // Unknown/homebrew slot strings (Track A or B) are appended after the known anatomical order —
  // never dropped from view, per the plan's "homebrew slot names" risk.
  const unknownKeys = [...new Set([...Object.keys(slots.bySlot), ...Object.keys(slots.tattoosBySlot)])].filter(
    (k) => !known.has(k),
  );
  const rowKeys: string[] = [...SLOT_DISPLAY_ORDER, ...unknownKeys];

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start", className)}>
      {/* Desktop-only compact silhouette. Decorative (aria-hidden) — the slot list below is the
          accessible representation of the same data. */}
      <div
        aria-hidden="true"
        className="relative hidden aspect-[300/460] w-24 shrink-0 self-center sm:block sm:self-start"
      >
        <svg viewBox="0 0 300 460" className="absolute inset-0 h-full w-full">
          <circle cx="150" cy="42" r="27" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <path
            d="M108 85 h84 l6 30 v95 h-96 v-95 z"
            className="fill-surface-sunken stroke-border"
            strokeWidth={2}
          />
          <rect x="78" y="90" width="20" height="165" rx="10" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <rect x="202" y="90" width="20" height="165" rx="10" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <rect x="118" y="205" width="28" height="220" rx="12" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <rect x="154" y="205" width="28" height="220" rx="12" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <ellipse cx="88" cy="258" rx="13" ry="10" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <ellipse cx="212" cy="258" rx="13" ry="10" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <ellipse cx="132" cy="435" rx="16" ry="9" className="fill-surface-sunken stroke-border" strokeWidth={2} />
          <ellipse cx="168" cy="435" rx="16" ry="9" className="fill-surface-sunken stroke-border" strokeWidth={2} />
        </svg>
        {SLOT_DISPLAY_ORDER.map((key) => {
          const pos = SLOT_POSITIONS[key]!;
          const { count } = occupancy(slots.bySlot[key] ?? []);
          const hasTattoo = (slots.tattoosBySlot[key]?.length ?? 0) > 0;
          return (
            <span
              key={key}
              className={cn(
                "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                dotClass(count),
                hasTattoo && "ring-2 ring-rune ring-offset-1 ring-offset-background",
              )}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            />
          );
        })}
      </div>

      {/* Slot list — on desktop it's the doll's accessible callout list; on mobile (no silhouette
          above sm) it IS the entire layout, per the plan's mobile-first honesty. */}
      <div className="min-w-0 flex-1 space-y-2">
        {slots.warnings.length > 0 && (
          <div className="space-y-1 rounded-lg border border-warning/50 bg-warning/10 p-2.5">
            {slots.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                <span>{w}</span>
              </p>
            ))}
          </div>
        )}
        <ul className="space-y-1">
          {rowKeys.map((key) => {
            const { count, text } = occupancy(slots.bySlot[key] ?? []);
            const hasTattoo = (slots.tattoosBySlot[key] ?? []).length > 0;
            return (
              <li
                key={key}
                className="flex min-h-9 items-center gap-2 rounded-md border border-border/60 bg-surface-raised/30 px-2 py-1 text-sm"
              >
                <span className={cn("size-2 shrink-0 rounded-full border", dotClass(count))} />
                <span className="w-24 shrink-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {slotLabel(key)}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    count > 0 ? "text-foreground" : "italic text-muted-foreground",
                  )}
                >
                  {count > 0 ? text : "Empty"}
                </span>
                {hasTattoo && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-rune">
                    + Tattoo
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {slots.held.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Held ({slots.handsUsed}/{slots.handsAvailable} hands)
            </p>
            <ul className="space-y-1">
              {slots.held.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-surface-raised/30 px-2 py-1 text-sm"
                >
                  <span className="min-w-0 truncate text-foreground">{h.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {h.hands} {h.hands > 1 ? "hands" : "hand"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
