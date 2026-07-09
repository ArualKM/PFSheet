import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { RouteTransition } from "@/components/motion/route-transition";
import { getUser } from "@/lib/auth/session";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // Reflect the real session so a signed-in visitor sees "Open dashboard" instead of the
  // logged-out "Log in / Get started" chrome (which read as being signed out even though the
  // session was valid). Reading the session opts the marketing routes into dynamic rendering.
  const user = await getUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-6">
          <Logo href="/" />
          <nav className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <Button asChild size="sm">
                  <Link href="/dashboard">Open dashboard</Link>
                </Button>
                <AccountMenu email={user.email} displayName={user.displayName} />
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <RouteTransition>{children}</RouteTransition>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:px-6">
          <Logo href="/" showWordmark />
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 md:ml-auto">
            <Link href="/developers" className="hover:text-foreground">
              Developers
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground/80 md:max-w-xs md:text-right">
            A fan-made Pathfinder 1e toolkit. Not affiliated with or endorsed by Paizo Inc. Icons by{" "}
            <a
              href="https://game-icons.net"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              game-icons.net
            </a>{" "}
            (CC BY 3.0).
          </p>
        </div>
      </footer>
    </div>
  );
}
