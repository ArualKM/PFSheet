"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * Renders the first `cap` children with a "Show all N" toggle — progressive disclosure
 * for long read-view lists on small screens. Takes pre-rendered children (NOT a render
 * function) so it works when used from a Server Component — a function prop can't cross
 * the server→client boundary. The full list is already in the (already-authorized) props.
 */
export function ShowMore({
  children,
  cap = 6,
  className,
  noun = "",
}: {
  children: ReactNode;
  cap?: number;
  className?: string;
  noun?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const shown = expanded ? items : items.slice(0, cap);
  return (
    <>
      <div className={className}>{shown}</div>
      {items.length > cap && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 text-xs font-medium text-rune hover:underline"
        >
          {expanded ? "Show less" : `Show all ${items.length}${noun ? ` ${noun}` : ""}`}
        </button>
      )}
    </>
  );
}
