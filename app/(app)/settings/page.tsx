import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Manage your account and preferences." />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-border pb-3">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground">{user.email ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Display name</span>
            <span className="text-foreground">{user.displayName ?? "—"}</span>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div>
            <div className="font-medium text-foreground">API keys</div>
            <div className="text-sm text-muted-foreground">Create and manage developer API keys.</div>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings/api">Manage</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
