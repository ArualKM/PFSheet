"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A collapsible list section: an uppercase title + count badge + chevron header that toggles a
 * bordered body. Extracted from the Path of War DisciplineGroup so spells / powers / maneuvers /
 * sphere talents can all tame long lists the same way. The 44px header is a full-width tap target
 * (mobile), carries aria-expanded/aria-controls, and rotates the chevron when collapsed.
 *
 * Callers decide the default open state — the convention across the list surfaces is
 * `defaultOpen = total <= COLLAPSE_WHEN_OVER` so short lists stay open and long ones collapse to a
 * compact, scannable index of headers.
 */
export const COLLAPSE_WHEN_OVER = 12;

export function CollapsibleGroup({
  title,
  count,
  defaultOpen = true,
  forceOpen = false,
  accessory,
  children,
  className,
  titleClassName,
}: {
  title: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  /**
   * Escape hatch for "a child was just added/opened in this group". When it transitions to true the
   * group opens itself; because it only reacts to the change-to-true, a manual collapse afterward is
   * preserved (forceOpen stays true → no re-open). Lets an add-into-a-collapsed-group flow reveal
   * (and auto-expand) the new entry that would otherwise be hidden behind `{open && ...}`.
   */
  forceOpen?: boolean;
  /** Right-aligned header content, e.g. a prepared used/total counter. */
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  // Open when the parent signals a child was just added/opened in this group (render-phase "adjust on
  // prop change" — the idiom EntryCard uses). Fires only on the change-to-true, so a manual collapse
  // afterward sticks (forceOpen stays true → no re-open). Never force-closes.
  const [prevForceOpen, setPrevForceOpen] = useState(forceOpen);
  if (forceOpen !== prevForceOpen) {
    setPrevForceOpen(forceOpen);
    if (forceOpen) setOpen(true);
  }
  const panelId = useId();
  return (
    <div className={cn("min-w-0 rounded-md border border-border/60", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
        <span className={cn("truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground", titleClassName)}>
          {title}
        </span>
        {count != null && (
          <span className="rounded-full bg-surface-raised px-1.5 text-[10px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
        {accessory != null && <span className="ml-auto shrink-0">{accessory}</span>}
      </button>
      {open && (
        <div id={panelId} className="space-y-1 border-t border-border/50 p-2">
          {children}
        </div>
      )}
    </div>
  );
}
