"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";

/**
 * Mobile left-drawer navigation (Radix Dialog → focus trap + Esc + scrim). Mirrors the
 * desktop sidebar so secondary routes (Settings) are reachable on phones, where the
 * bottom nav only shows the four primary destinations.
 */
export function MobileNavDrawer({ user }: { user: { email?: string; displayName?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon-touch" aria-label="Open navigation menu">
          <Menu className="size-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-xl focus:outline-none md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <div className="flex h-14 items-center justify-between px-4">
            <Logo href="/dashboard" />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-touch" aria-label="Close menu">
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          {/* Navigating closes the drawer (clicks bubble up from the links). */}
          <div className="flex-1 overflow-y-auto px-3 py-2" onClick={() => setOpen(false)}>
            <SidebarNav compact />
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <UserMenu email={user.email} displayName={user.displayName} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
