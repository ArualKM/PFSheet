"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import { useRailMode } from "./collapsible-sidebar";
import { cn } from "@/lib/utils";

const TOOLTIP_ID = "pf-nav-tooltip";

/** The desktop sidebar rail nav (the only caller since the mobile drawer was removed). Labels collapse with
 * the rail via the `@container/sb` container query; when collapsed the text is hidden so each link carries an
 * explicit aria-label. */
export function SidebarNav() {
  const pathname = usePathname();
  const mode = useRailMode();
  // A single fixed-positioned tooltip for whichever item is hovered/focused — only while the rail is
  // pinned "closed" ("auto" hover-expands the rail, "open" already shows labels). position:fixed +
  // a portal escapes the rail's overflow-hidden / scroll container.
  const [tip, setTip] = useState<{ href: string; label: string; desc?: string; top: number; left: number } | null>(
    null,
  );

  const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, item: NavItem) => {
    if (mode !== "closed") return;
    const r = e.currentTarget.getBoundingClientRect();
    // Clamp the vertical center so a near-edge item's tooltip stays on screen.
    const top = Math.min(Math.max(r.top + r.height / 2, 28), window.innerHeight - 28);
    setTip({ href: item.href, label: item.label, desc: item.description, top, left: r.right + 10 });
  };
  const hide = () => setTip(null);

  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            // Rail (collapsed) hides the text, so it needs an explicit name.
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            aria-describedby={tip?.href === item.href ? TOOLTIP_ID : undefined}
            onMouseEnter={(e) => show(e, item)}
            onMouseLeave={hide}
            onFocus={(e) => show(e, item)}
            onBlur={hide}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "justify-center @min-[8rem]/sb:justify-start",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold",
              active
                ? "bg-surface-raised text-foreground"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", active ? "text-gold" : "text-muted-foreground")}
            />
            <span className="hidden truncate whitespace-nowrap @min-[8rem]/sb:block">{item.label}</span>
          </Link>
        );
      })}
      {tip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={TOOLTIP_ID}
            role="tooltip"
            style={{ position: "fixed", top: tip.top, left: tip.left, transform: "translateY(-50%)" }}
            className="pointer-events-none z-[100] max-w-xs rounded-md border border-border bg-surface-raised px-3 py-2 text-xs shadow-2xl"
          >
            <div className="font-semibold text-foreground">{tip.label}</div>
            {tip.desc && <div className="mt-0.5 text-muted-foreground">{tip.desc}</div>}
          </div>,
          document.body,
        )}
    </nav>
  );
}
