"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Toggles the character read view between the modern card dashboard and the classic stat-block sheet.
 * Both trees are server-rendered and handed in as props (RSC-safe — no function props cross the
 * boundary), so switching is an instant, fetch-free client swap.
 *
 * Persistence honours "global default + per-character override": choosing a view stores it as this
 * character's override AND updates the global default, so each sheet remembers its own view while
 * un-set sheets follow the most recent choice. Storage is localStorage (per browser); cross-device
 * sync can move these to the profile/sheet later without changing this contract.
 */
const GLOBAL_KEY = "pf:sheetView";
const charKey = (id: string) => `pf:sheetView:${id}`;
type View = "modern" | "classic";
const VIEWS: View[] = ["modern", "classic"];

export function SheetViewSwitch({
  characterId,
  modern,
  classic,
}: {
  characterId: string;
  modern: ReactNode;
  classic: ReactNode;
}) {
  // SSR + first paint render "modern" (matches the server) to avoid a hydration mismatch or a flash
  // of blank content; the stored preference is applied on mount.
  const [view, setView] = useState<View>("modern");

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(charKey(characterId)) ?? localStorage.getItem(GLOBAL_KEY);
      if (stored === "classic" || stored === "modern") setView(stored);
    } catch {
      /* localStorage unavailable (private mode / SSR) — keep the default */
    }
  }, [characterId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(charKey(characterId), next);
      localStorage.setItem(GLOBAL_KEY, next);
    } catch {
      /* ignore write failures */
    }
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div
          role="group"
          aria-label="Sheet view"
          className="inline-flex rounded-full border border-border bg-surface-sunken p-0.5"
        >
          {VIEWS.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => choose(val)}
              aria-pressed={view === val}
              className={cn(
                "min-h-9 rounded-full px-4 text-xs font-semibold capitalize transition-colors",
                view === val
                  ? "bg-gold text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {val}
            </button>
          ))}
        </div>
      </div>
      <div key={view} className="pf-view-fade">
        {view === "classic" ? classic : modern}
      </div>
    </div>
  );
}
