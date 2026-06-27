"use client";

import { useState, type ReactNode } from "react";

/**
 * Renders the first `cap` items with a "Show all N" toggle — progressive disclosure
 * for long read-view lists on small screens. The full list is already in props (a
 * client-side slice of already-authorized data; nothing is fetched, so it can't leak).
 */
export function ShowMore<T>({
  items,
  cap = 6,
  render,
  className,
  noun = "",
}: {
  items: T[];
  cap?: number;
  render: (item: T, index: number) => ReactNode;
  className?: string;
  noun?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, cap);
  return (
    <>
      <div className={className}>{shown.map(render)}</div>
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
