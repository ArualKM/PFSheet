import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "./sidebar-nav";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppShell({
  user,
  children,
}: {
  user: { email?: string; displayName?: string };
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      {/* Skip past the nav straight to the page content (keyboard / screen-reader users). */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/60 md:flex">
        <div className="flex h-14 items-center px-4">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <SidebarNav />
        </div>
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Theme
            </span>
            <ThemeToggle />
          </div>
          <UserMenu email={user.email} displayName={user.displayName} />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-1 md:hidden">
            <MobileNavDrawer user={user} />
            <Logo href="/dashboard" />
          </div>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <ThemeToggle />
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-8">
          {children}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

/** Consistent page heading used inside the app shell. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
