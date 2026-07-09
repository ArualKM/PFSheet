"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Toggles the character read view between the modern card dashboard, the classic stat-block sheet,
 * and (when the character is a companion) a dedicated companion view. All trees are server-rendered
 * and handed in as props (RSC-safe — no function props cross the boundary), so switching is an
 * instant, fetch-free client swap.
 *
 * View set: the pill group only ever shows views that were actually provided — "companion" appears
 * only when the `companion` prop is passed (i.e. the character IS a companion); everyone else just
 * gets modern/classic.
 *
 * Initial view: `defaultView` is a server-computed hint (e.g. "companion" for a companion sheet) and
 * is used verbatim for the initial render — including the very first client render — so there is no
 * hydration mismatch. It falls back to "modern" if unset, or if it names "companion" without a
 * `companion` prop actually being available.
 *
 * Persistence honours "global default + per-character override": choosing modern/classic stores it as
 * this character's override AND updates the global default, so un-set sheets follow the most recent
 * modern/classic choice. "companion" is deliberately NOT written to the global key — it's meaningless
 * on the vast majority of (non-companion) sheets and would otherwise pollute everyone else's default.
 * On mount, the per-character key wins if it names an available view; otherwise the global key is
 * consulted, but ONLY when there's no `companion` prop — on an actual companion sheet, a stale global
 * "classic"/"modern" choice from browsing a different (PC) sheet must never beat the companion
 * auto-default. Storage is localStorage (per browser); cross-device sync can move these to the
 * profile/sheet later without changing this contract.
 */
const GLOBAL_KEY = "pf:sheetView";
const charKey = (id: string) => `pf:sheetView:${id}`;
type View = "modern" | "classic" | "companion";

export function SheetViewSwitch({
  characterId,
  modern,
  classic,
  companion,
  defaultView,
}: {
  characterId: string;
  modern: ReactNode;
  classic: ReactNode;
  companion?: ReactNode;
  defaultView?: View;
}) {
  const hasCompanion = Boolean(companion);
  const views: View[] = hasCompanion ? ["companion", "modern", "classic"] : ["modern", "classic"];

  // SSR + first paint use the server-computed default (matches the server — no hydration mismatch or
  // flash of blank content); the stored preference, if any, is applied on mount.
  const [view, setView] = useState<View>(
    defaultView && (defaultView !== "companion" || companion) ? defaultView : "modern",
  );

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    try {
      const perChar = localStorage.getItem(charKey(characterId));
      if (perChar && (views as string[]).includes(perChar)) {
        setView(perChar as View);
        return;
      }
      // Only fall back to the global default when this sheet has no companion view of its own —
      // otherwise a global choice made while browsing a different (non-companion) sheet would beat
      // the companion auto-default.
      if (!hasCompanion) {
        const global = localStorage.getItem(GLOBAL_KEY);
        if (global && (views as string[]).includes(global)) setView(global as View);
      }
    } catch {
      /* localStorage unavailable (private mode / SSR) — keep the default */
    }
    // Deps are the STABLE derivations (id + whether a companion view exists), not the `companion`
    // ReactNode itself — node identity can change on any parent re-render, and a re-run here would
    // silently revert an explicit pill choice back to the stored value.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `views` is derived from `hasCompanion` each render
  }, [characterId, hasCompanion]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(charKey(characterId), next);
      if (next !== "companion") localStorage.setItem(GLOBAL_KEY, next);
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
          {views.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => choose(val)}
              aria-pressed={view === val}
              className={cn(
                "min-h-11 rounded-full px-4 text-xs font-semibold capitalize transition-colors sm:min-h-9",
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
        {view === "classic" ? classic : view === "companion" && companion ? companion : modern}
      </div>
    </div>
  );
}
