import type { Metadata } from "next";
import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { Swords } from "@/components/ui/game-icons";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignsHeader } from "@/components/campaign/campaigns-header";
import { PendingInvitations, type PendingInvitation } from "@/components/campaign/pending-invitations";

export const metadata: Metadata = { title: "Campaigns" };

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  campaign_characters: { count: number }[];
};

const GM_ROLES = new Set(["owner", "gm", "assistant_gm"]);

/**
 * Resolve display details for the viewer's pending invitations. The viewer can't
 * read these campaigns through RLS yet (they're not an active member), so the
 * admin client fetches names + GM display names — gated by the caller having
 * passed in only campaign ids the viewer actually holds an invitation row for.
 */
async function loadInvitations(campaignIds: string[]): Promise<PendingInvitation[]> {
  if (campaignIds.length === 0) return [];
  const admin = createAdminClient();
  const { data: camps } = await admin
    .from("campaigns")
    .select("id, name, description, owner_id")
    .in("id", campaignIds);
  if (!camps?.length) return [];
  const ownerIds = [...new Set(camps.map((c) => c.owner_id))];
  const { data: owners } = await admin.from("profiles").select("id, display_name").in("id", ownerIds);
  const ownerName = new Map<string, string>();
  for (const o of owners ?? []) ownerName.set(o.id, o.display_name ?? "Game Master");
  return camps.map((c) => ({
    campaignId: c.id,
    name: c.name,
    description: c.description,
    gmName: ownerName.get(c.owner_id) ?? "Game Master",
  }));
}

export default async function CampaignsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: campaignData }, { data: membershipData }, { data: inviteRows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, description, updated_at, campaign_characters(count)")
      .order("updated_at", { ascending: false }),
    supabase.from("campaign_members").select("campaign_id, role").eq("user_id", user.id).eq("status", "active"),
    // Pending invitations: rows the viewer can read via members_select (their own
    // row), but whose campaigns RLS hides from them until they accept. The campaign
    // names/owners are resolved with the admin client below — authorized by the fact
    // that the viewer genuinely holds an invitation row for each one.
    supabase.from("campaign_members").select("campaign_id").eq("user_id", user.id).eq("status", "invited"),
  ]);

  const campaigns = (campaignData ?? []) as CampaignRow[];
  const roleByCampaign = new Map<string, string>();
  for (const m of membershipData ?? []) roleByCampaign.set(m.campaign_id, m.role);

  const invitations = await loadInvitations((inviteRows ?? []).map((r) => r.campaign_id));

  return (
    <div className="mx-auto max-w-5xl">
      <CampaignsHeader />

      <PendingInvitations invitations={invitations} />

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
        <div className="pf-stagger grid gap-3 sm:grid-cols-2">
          {campaigns.map((c) => {
            const role = roleByCampaign.get(c.id);
            const isGm = role ? GM_ROLES.has(role) : false;
            const rosterCount = c.campaign_characters?.[0]?.count ?? 0;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="h-full pf-hover-lift">
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
