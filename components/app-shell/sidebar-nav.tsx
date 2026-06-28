"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const pathname = usePathname();

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
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold",
              active
                ? "bg-surface-raised text-foreground"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", active ? "text-gold" : "text-muted-foreground")}
            />
            <span className="truncate whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
