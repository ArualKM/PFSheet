import type { Metadata } from "next";
import { Swords } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Campaigns"
        description="Group characters into a table, review sheets as a GM, and keep the party in sync."
      />
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-gold/10 text-gold">
            <Swords className="size-6" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">Campaigns are coming together</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            The campaign roster, GM audit view, and approval workflow arrive in an upcoming
            milestone. The data model and permissions are already in place.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
