"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronsLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/** Three rail states, persisted per-rail:
 *  - "auto"   — collapsed icons-only strip; hover / keyboard-focus overlay-expands (no reflow).
 *  - "open"   — pinned expanded; reflows the layout (the flow spacer widens).
 *  - "closed" — pinned collapsed; stays icons-only and does NOT hover-expand. */
type Mode = "auto" | "open" | "closed";

/** Literal Tailwind class bundles per variant — Tailwind only generates classes it can see verbatim
 * in source, so widths can't be string-interpolated. */
const VARIANTS = {
  nav: {
    spacerCollapsed: "md:w-14",
    spacerExpanded: "md:w-64",
    auto: "w-14 hover:w-64 focus-within:w-64 hover:shadow-2xl focus-within:shadow-2xl",
    open: "w-64",
    closed: "w-14",
  },
  sections: {
    spacerCollapsed: "md:w-12",
    spacerExpanded: "md:w-52",
    auto: "w-12 hover:w-52 focus-within:w-52 hover:shadow-2xl focus-within:shadow-2xl",
    open: "w-52",
    closed: "w-12",
  },
} as const;

function readMode(key: string): Mode {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "open" || raw === "closed" || raw === "auto") return raw;
    if (raw === "1") return "open"; // migrate the old boolean-pin value
  } catch {
    /* storage unavailable — rail still works, just doesn't persist */
  }
  return "auto";
}

/**
 * Desktop (md+) collapsible rail. Labels live inside `children`; they are hidden whenever the rail is
 * narrow and revealed only once it widens — driven by a **container query** (`@container/sb` on the
 * aside, `@min-[8rem]/sb:` on each label), so a collapsed rail shows clean icons with NO peeking text,
 * for every state (the prior overflow-clip approach let label text bleed into the icon strip). Mobile
 * is unaffected (`hidden md:*`); the mobile drawer handles small screens.
 */
export function CollapsibleSidebar({
  children,
  storageKey,
  ariaLabel,
  variant = "nav",
  header,
}: {
  children: ReactNode;
  /** localStorage suffix, e.g. "app-nav" → pf-sidebar-mode:app-nav */
  storageKey: string;
  ariaLabel: string;
  variant?: keyof typeof VARIANTS;
  /** Optional top-of-rail content (e.g. the logo); shares the header row with the `<<` collapse toggle. */
  header?: ReactNode;
}) {
  const v = VARIANTS[variant];
  const [mode, setMode] = useState<Mode>("auto");
  const key = `pf-sidebar-mode:${storageKey}`;

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    setMode(readMode(key));
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Each pin toggles its own state on; clicking it again returns to "auto".
  const choose = (target: Mode) =>
    setMode((m) => {
      const next = m === target ? "auto" : target;
      try {
        localStorage.setItem(key, next);
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <>
      {/* Flow spacer: reserves width so page content never sits under the fixed rail. Only "open" reflows. */}
      <div
        aria-hidden
        className={cn(
          "hidden shrink-0 transition-[width] duration-200 md:block",
          mode === "open" ? v.spacerExpanded : v.spacerCollapsed,
        )}
      />
      <aside
        aria-label={ariaLabel}
        data-mode={mode}
        className={cn(
          "group/sb fixed inset-y-0 left-0 z-40 hidden h-dvh shrink-0 flex-col overflow-hidden @container/sb",
          "border-r border-border bg-surface transition-[width] duration-200 md:flex",
          mode === "open" ? v.open : mode === "closed" ? v.closed : v.auto,
        )}
      >
        {header && (
          <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-3">
            <div className="flex min-w-0 flex-1 items-center justify-center @min-[8rem]/sb:justify-start">
              {header}
            </div>
            {/* `<<` — pin the rail closed (icons-only, no hover-expand). Only reachable while expanded. */}
            <button
              type="button"
              onClick={() => choose("closed")}
              aria-pressed={mode === "closed"}
              aria-label="Keep sidebar collapsed"
              title="Keep collapsed"
              className="hidden shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold @min-[8rem]/sb:inline-flex"
            >
              <ChevronsLeft className="size-4" />
            </button>
          </div>
        )}
        {children}
        {/* Pin open / unpin (bottom). Also the way back from "closed" → "open". */}
        <button
          type="button"
          onClick={() => choose("open")}
          aria-pressed={mode === "open"}
          aria-label={mode === "open" ? "Unpin sidebar" : "Pin sidebar open"}
          title={mode === "open" ? "Unpin" : "Pin open"}
          className="flex shrink-0 items-center justify-center gap-3 whitespace-nowrap border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold @min-[8rem]/sb:justify-start"
        >
          {mode === "open" ? (
            <PanelLeftClose className="size-4 shrink-0" />
          ) : (
            <PanelLeftOpen className="size-4 shrink-0" />
          )}
          <span className="hidden @min-[8rem]/sb:inline">{mode === "open" ? "Unpin" : "Pin open"}</span>
        </button>
      </aside>
    </>
  );
}
