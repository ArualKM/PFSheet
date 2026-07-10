"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useShouldAnimate } from "./use-should-animate";

/**
 * App-wide Motion default: when data-motion/prefers-reduced-motion says "don't animate",
 * MotionConfig reducedMotion="always" forces POSITIONAL and TRANSFORM values instant. This is the
 * Motion-side mirror of the CSS `@media (prefers-reduced-motion: reduce)` block in globals.css.
 *
 * ⚠ THIS PROVIDER ALONE IS NOT THE HARD "OFF" GUARANTEE. Verified against motion-dom@12.42.2
 * source: reducedMotion="always" only force-instants `positionalKeys` (width/height/top/left/…)
 * plus transforms (x/y/scale/rotate/…) — NON-positional values, notably `opacity`, keep running
 * their full transition. Any animation that includes opacity (or color, etc.) MUST additionally
 * branch on `useShouldAnimate()` per-component (render plain DOM, or pass
 * `transition={{ duration: 0 }}`, when it returns false) — see ClassicZone's `animated` branch
 * for the reference pattern, and ANIMATION_SYSTEM.md §2 "Per-component fallback pattern".
 *
 * Note the inverted-sounding prop: MotionConfig's `reducedMotion` prop name describes *when
 * Motion should reduce motion*, so "always" means "always skip animation" (our collapsed state)
 * and "never" means "never force-skip" (our animating state). Installed motion@12.42.2's
 * `ReducedMotionConfig` type is `"always" | "never" | "user"`, matching the spec.
 */
export function PfMotionConfig({ children }: { children: ReactNode }) {
  const shouldAnimate = useShouldAnimate();
  return (
    <MotionConfig reducedMotion={shouldAnimate ? "never" : "always"} transition={{ duration: 0.24 }}>
      {children}
    </MotionConfig>
  );
}
