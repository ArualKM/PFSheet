"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

/**
 * Floating "back to top" affordance for long mobile pages (editor / read sheet). Appears only after ~2
 * viewport-heights of scroll, anchored ABOVE the bottom tab bar + safe area so they never overlap. The scroll
 * read is rAF-throttled + passive (it only toggles a boolean), so it's effectively free. Mobile-only — the
 * desktop sidebar keeps navigation in reach.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setShow(window.scrollY > window.innerHeight * 2);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-4 z-40 grid size-11 place-items-center rounded-full border border-border bg-surface-raised text-foreground shadow-lg transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
    >
      <ChevronUp className="size-5" />
    </button>
  );
}
