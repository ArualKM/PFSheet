"use client";

import { useSyncExternalStore } from "react";

/**
 * Single source of truth for "should decorative motion play right now", shared by the CSS motion
 * system (data-motion + prefers-reduced-motion, see app/globals.css) and Motion (motion/react).
 * Mirrors the exact collapse logic already in globals.css:
 *   - data-motion="off"          -> never animate
 *   - data-motion="full"         -> always animate (ignores OS reduce-motion)
 *   - data-motion="system" (default) -> animate unless the OS requests reduced motion
 * Reads the DOM attribute + a MediaQueryList via useSyncExternalStore so it never needs a
 * useEffect+setState round trip and is SSR-safe (server snapshot = true, matching the CSS
 * default which always renders content, just possibly without motion on the client).
 */
function subscribe(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributeFilter: ["data-motion"] });
  mql.addEventListener("change", callback);
  return () => {
    observer.disconnect();
    mql.removeEventListener("change", callback);
  };
}

function getSnapshot(): boolean {
  const pref = document.documentElement.dataset.motion;
  if (pref === "off") return false;
  if (pref === "full") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return true; // SSR default mirrors data-motion="system" pre-hydration; CSS still gates the paint.
}

export function useShouldAnimate(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
