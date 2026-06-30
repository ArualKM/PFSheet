"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Settings, LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Mobile account menu (top-right avatar → Settings · Sign out). Holds the two payloads that used to live only
 * in the now-removed mobile nav drawer, so they stay reachable once the sidebar is killed on phones. Theme
 * stays as the sibling <ThemeToggle> icon in the header. Radix DropdownMenu gives focus management + Esc +
 * arrow-key nav for free.
 */
export function AccountMenu({ email, displayName }: { email?: string; displayName?: string }) {
  const label = displayName || email || "Adventurer";
  const initial = label.charAt(0).toUpperCase();
  const itemClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-surface-sunken";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon-touch" aria-label="Account menu">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-gold/15 text-sm font-semibold text-gold">
            {initial}
          </span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-lg border border-border bg-surface-raised p-1 shadow-xl"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-foreground">{displayName || "Adventurer"}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <Link href="/settings" className={itemClass}>
              <Settings className="size-4 text-muted-foreground" /> Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <form action={signOutAction}>
            <DropdownMenu.Item asChild>
              <button type="submit" className={itemClass}>
                <LogOut className="size-4 text-muted-foreground" /> Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
