import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export function UserMenu({ email, displayName }: { email?: string; displayName?: string }) {
  const label = displayName || email || "Adventurer";
  const initial = label.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/15 text-sm font-semibold text-gold"
        >
          {initial}
        </span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      </div>
      <form action={signOutAction} className="ml-auto">
        <Button variant="ghost" size="icon" type="submit" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  );
}
