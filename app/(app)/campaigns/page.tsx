import type { Metadata } from "next";
import Link from "next/link";
import { Swords, Users, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignCreateForm } from "@/components/campaign/campaign-create-form";

export const metadata: Metadata = { title: "Campaigns" };

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  campaign_characters: { count: number }[];
};

const GM_ROLES = new Set(["owner", "gm", "assistant_gm"]);

export default async function CampaignsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: campaignData }, { data: membershipData }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, description, updated_at, campaign_characters(count)")
      .order("updated_at", { ascending: false }),
    supabase.from("campaign_members").select("campaign_id, role").eq("user_id", user.id).eq("status", "active"),
  ]);

  const campaigns = (campaignData ?? []) as CampaignRow[];
  const roleByCampaign = new Map<string, string>();
  for (const m of membershipData ?? []) roleByCampaign.set(m.campaign_id, m.role);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Campaigns"
        description="Group characters into a table, review sheets as a GM, and keep the party in sync."
        actions={<CampaignCreateForm />}
      />

      {campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-gold/10 text-gold">
              <Swords className="size-6" />
            </span>
            <h2 className="text-lg font-semibold text-foreground">No campaigns yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Create a campaign to build a roster, review character sheets as the GM, and track
              approvals. Players join by handle and attach their own characters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {campaigns.map((c) => {
            const role = roleByCampaign.get(c.id);
            const isGm = role ? GM_ROLES.has(role) : false;
            const rosterCount = c.campaign_characters?.[0]?.count ?? 0;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="h-full transition-colors hover:border-gold/40">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{c.name}</div>
                        {c.description && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                            {c.description}
                          </p>
                        )}
                      </div>
                      <Badge variant={isGm ? "gold" : "default"}>{isGm ? "GM" : "Player"}</Badge>
                    </div>
                    <div className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-4" />
                        {rosterCount} {rosterCount === 1 ? "character" : "characters"}
                      </span>
                      <ArrowRight className="size-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
