"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Replays a route-entrance animation on every navigation. The key is the pathname, so each new route
 * re-mounts this wrapper and the `.pf-route` CSS entrance plays (desktop fade+rise, mobile slide —
 * see globals.css). The shared app shell sits OUTSIDE this wrapper (in the layout), so only the page
 * content animates; the sidebar/header stay put. Fully gated by the motion preference — collapses to
 * instant when motion is off or the OS requests reduced motion.
 *
 * `children` are already-rendered Server Component output passed straight through — this only wraps
 * them in a keyed div, so it adds no meaningful bundle weight and no server/client boundary issues.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="pf-route">
      {children}
    </div>
  );
}
