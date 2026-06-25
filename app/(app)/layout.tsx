import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={{ email: user.email, displayName: user.displayName }}>{children}</AppShell>
  );
}
