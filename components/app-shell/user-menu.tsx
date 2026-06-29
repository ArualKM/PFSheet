import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** `collapsible` ties the avatar + name to the sidebar container query (`@container/sb`): when the rail
 * is collapsed only the sign-out button shows, centered; expanded shows avatar + name + sign-out. Used
 * outside the rail (mobile drawer) without the prop, it always shows everything. */
export function UserMenu({
  email,
  displayName,
  collapsible,
}: {
  email?: string;
  displayName?: string;
  collapsible?: boolean;
}) {
  const label = displayName || email || "Adventurer";
  const initial = label.charAt(0).toUpperCase();

  return (
    <div className={cn("flex items-center gap-2", collapsible && "justify-center @min-[8rem]/sb:justify-between")}>
      <div className={cn("flex min-w-0 items-center gap-2.5", collapsible && "hidden @min-[8rem]/sb:flex")}>
        <span
          aria-hidden="true"
          title={label}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/15 text-sm font-semibold text-gold"
        >
          {initial}
        </span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      </div>
      <form action={signOutAction} className={cn(!collapsible && "ml-auto")}>
        {/* When collapsed the avatar + name are hidden, so carry the identity on the sign-out control
            for screen readers (the only thing announced in the icons-only rail). */}
        <Button
          variant="ghost"
          size="icon"
          type="submit"
          aria-label={collapsible ? `Sign out — signed in as ${label}` : "Sign out"}
          title="Sign out"
        >
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  );
}
