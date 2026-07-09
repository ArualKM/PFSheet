import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell/app-shell";
import { RouteTransition } from "@/components/motion/route-transition";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={{ email: user.email, displayName: user.displayName }}>
      <RouteTransition>{children}</RouteTransition>
    </AppShell>
  );
}
