"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftToLine, ArrowRightFromLine, ChevronsLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/** Four rail states, persisted per-rail:
 *  - "auto"   — collapsed icons-only strip; hover / keyboard-focus overlay-expands (no reflow).
 *  - "open"   — pinned expanded; reflows the layout (the flow spacer widens).
 *  - "closed" — pinned collapsed; stays icons-only, does NOT hover-expand; hover shows tooltips.
 *  - "hidden" — hard-closed; the rail is removed entirely, leaving a floating "Open sidebar" button. */
export type RailMode = "auto" | "open" | "closed" | "hidden";

/** Lets rail descendants (e.g. SidebarNav) know the current mode so they only show hover tooltips while
 * "closed" (in "auto" the rail expands; in "open" the labels are already visible). */
const RailModeContext = createContext<RailMode>("auto");
export function useRailMode() {
  return useContext(RailModeContext);
}

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

function readMode(key: string): RailMode {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "open" || raw === "closed" || raw === "auto" || raw === "hidden") return raw;
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
 * for every state. Mobile is unaffected (`hidden md:*`); the mobile drawer handles small screens.
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
  const [mode, setMode] = useState<RailMode>("auto");
  const key = `pf-sidebar-mode:${storageKey}`;
  const restoreKey = `pf-sidebar-restore:${storageKey}`;
  const asideRef = useRef<HTMLElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);
  // Only move focus on a USER toggle (not the initial localStorage restore — which would steal focus on load).
  const userToggledRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    setMode(readMode(key));
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // After a user hides/shows the rail, move focus to the control that replaces the one that vanished.
  useEffect(() => {
    if (!userToggledRef.current) return;
    userToggledRef.current = false;
    if (mode === "hidden") openBtnRef.current?.focus();
    else asideRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
  }, [mode]);

  const persist = (m: RailMode) => {
    try {
      localStorage.setItem(key, m);
    } catch {
      /* ignore */
    }
  };
  // Each pin toggles its own state on; clicking it again returns to "auto".
  const choose = (target: RailMode) =>
    setMode((m) => {
      const next = m === target ? "auto" : target;
      persist(next);
      return next;
    });
  const hide = () => {
    userToggledRef.current = true;
    setMode((m) => {
      if (m !== "hidden") {
        try {
          localStorage.setItem(restoreKey, m);
        } catch {
          /* ignore */
        }
      }
      persist("hidden");
      return "hidden";
    });
  };
  const unhide = () => {
    userToggledRef.current = true;
    let restore: RailMode = "auto";
    try {
      const x = localStorage.getItem(restoreKey);
      if (x === "open" || x === "closed" || x === "auto") restore = x;
    } catch {
      /* ignore */
    }
    persist(restore);
    setMode(restore);
  };

  if (mode === "hidden") {
    return (
      <button
        type="button"
        ref={openBtnRef}
        onClick={unhide}
        aria-label="Open sidebar"
        title="Open sidebar"
        className="fixed bottom-3 left-3 z-50 hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground shadow-xl hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:flex"
      >
        <ArrowRightFromLine className="size-4" /> Open sidebar
      </button>
    );
  }

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
        ref={asideRef}
        aria-label={ariaLabel}
        data-mode={mode}
        className={cn(
          "group/sb fixed inset-y-0 left-0 z-40 hidden h-dvh shrink-0 flex-col overflow-hidden @container/sb",
          "border-r border-border bg-surface transition-[width] duration-200 md:flex",
          mode === "open" ? v.open : mode === "closed" ? v.closed : v.auto,
        )}
      >
        <RailModeContext.Provider value={mode}>
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
          {/* Pin open / unpin — also the way back from "closed" → "open". */}
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
          {/* Hard-close — removes the rail entirely (a floating "Open sidebar" button brings it back). */}
          <button
            type="button"
            onClick={hide}
            aria-label="Hide sidebar"
            title="Hide sidebar"
            className="flex shrink-0 items-center justify-center gap-3 whitespace-nowrap px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold @min-[8rem]/sb:justify-start"
          >
            <ArrowLeftToLine className="size-4 shrink-0" />
            <span className="hidden @min-[8rem]/sb:inline">Hide sidebar</span>
          </button>
        </RailModeContext.Provider>
      </aside>
    </>
  );
}
