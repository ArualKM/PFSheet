"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type MotionPref = "system" | "full" | "off";

const OPTIONS: { value: MotionPref; label: string; desc: string }[] = [
  { value: "system", label: "Match system", desc: "Follows your device's reduce-motion setting." },
  { value: "full", label: "Full", desc: "Always animate, even if your device reduces motion." },
  { value: "off", label: "Off", desc: "No animations or transitions." },
];

// External store (module scope) so the control reads/writes the motion preference without a
// setState-in-effect. `data-motion` on <html> is what every animation in globals.css is gated on.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function readPref(): MotionPref {
  try {
    const m = localStorage.getItem("pf-motion");
    if (m === "full" || m === "off") return m;
  } catch {
    /* storage disabled */
  }
  return "system";
}
function applyMotion(value: MotionPref) {
  try {
    localStorage.setItem("pf-motion", value);
  } catch {
    /* private mode — the attribute below still applies for this session. */
  }
  document.documentElement.dataset.motion = value;
  listeners.forEach((l) => l());
}

/**
 * User control for the app-wide motion preference. "Match system" defers to the OS
 * `prefers-reduced-motion`; "Full" forces motion on; "Off" removes it. The SSR default +
 * no-flash script (app/layout.tsx) mean this only ever overrides. CSS does the actual gating.
 */
export function MotionSettings() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as MotionPref);

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Animations" className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const active = pref === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => applyMotion(o.value)}
              className={cn(
                "pf-hover-lift rounded-xl border p-3 text-left",
                active
                  ? "border-gold bg-surface-raised ring-1 ring-gold/40"
                  : "border-border hover:bg-surface-raised/50",
              )}
            >
              <div className="text-sm font-medium text-foreground">{o.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{o.desc}</div>
            </button>
          );
        })}
      </div>
      {/* Live preview — re-mounts on change (keyed by pref) so it re-plays the entrance animation,
          giving instant tactile confirmation of the chosen setting. */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Preview:</span>
        <span
          key={pref}
          className="pf-scale-in inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-surface-raised px-3 py-1 font-medium text-foreground"
        >
          <span className="size-1.5 rounded-full bg-gold" />
          Arcane spark
        </span>
      </div>
    </div>
  );
}
