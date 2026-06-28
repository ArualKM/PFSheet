"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/** Literal Tailwind class bundles per variant — Tailwind only generates classes it can see verbatim
 * in source, so widths/variants can't be string-interpolated. Add a bundle here for each rail. */
const VARIANTS = {
  nav: {
    spacerCollapsed: "md:w-14",
    spacerExpanded: "md:w-64",
    collapsed: "w-14 hover:w-64 focus-within:w-64 hover:shadow-2xl focus-within:shadow-2xl",
    expanded: "w-64",
  },
  sections: {
    spacerCollapsed: "md:w-12",
    spacerExpanded: "md:w-52",
    collapsed: "w-12 hover:w-52 focus-within:w-52 hover:shadow-2xl focus-within:shadow-2xl",
    expanded: "w-52",
  },
} as const;

/**
 * Desktop (md+) collapsible rail. Collapsed to an icons-only strip by default; expands on
 * hover/keyboard-focus as an OVERLAY over the page content (no reflow). A pin toggle force-expands
 * and reflows the layout, persisted per-rail in localStorage. Labels live inside `children` and are
 * revealed purely by the width change + `overflow-hidden` — no per-item state needed. Mobile is
 * unaffected (this is `hidden md:*`); the mobile drawer / section sheet handles small screens.
 */
export function CollapsibleSidebar({
  children,
  storageKey,
  ariaLabel,
  variant = "nav",
}: {
  children: ReactNode;
  /** localStorage suffix, e.g. "app-nav" → pf-sidebar-pinned:app-nav */
  storageKey: string;
  ariaLabel: string;
  variant?: keyof typeof VARIANTS;
}) {
  const v = VARIANTS[variant];
  const [pinned, setPinned] = useState(false);
  const key = `pf-sidebar-pinned:${storageKey}`;

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    try {
      setPinned(localStorage.getItem(key) === "1");
    } catch {
      /* storage unavailable — rail still works, just doesn't persist */
    }
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const togglePin = () =>
    setPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <>
      {/* Flow spacer: reserves the collapsed (or pinned) width so page content never sits under the
          fixed rail. Hidden on mobile (drawer / sheet handles small screens). */}
      <div
        aria-hidden
        className={cn("hidden shrink-0 transition-[width] duration-200 md:block", pinned ? v.spacerExpanded : v.spacerCollapsed)}
      />
      <aside
        aria-label={ariaLabel}
        data-pinned={pinned || undefined}
        className={cn(
          "group/sb fixed inset-y-0 left-0 z-40 hidden h-dvh shrink-0 flex-col overflow-hidden",
          "border-r border-border bg-surface transition-[width] duration-200 md:flex",
          pinned ? v.expanded : v.collapsed,
        )}
      >
        {children}
        <button
          type="button"
          onClick={togglePin}
          aria-pressed={pinned}
          aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
          className="flex shrink-0 items-center gap-3 whitespace-nowrap border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
        >
          {pinned ? (
            <PanelLeftClose className="size-4 shrink-0" />
          ) : (
            <PanelLeftOpen className="size-4 shrink-0" />
          )}
          <span className="truncate">{pinned ? "Unpin" : "Pin open"}</span>
        </button>
      </aside>
    </>
  );
}
