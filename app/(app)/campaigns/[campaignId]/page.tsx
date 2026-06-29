import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Users, BookOpen, ClipboardList, Archive } from "lucide-react";
import { ScrollText } from "@/components/ui/game-icons";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewStatusMeta, needsReview, archiveReasonLabel } from "@/lib/character/review-status";
import { enabledModuleKeys, moduleName } from "@/lib/character/campaign-modules";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddCharacter } from "@/components/campaign/add-character";
import { CampaignMembers, type CampaignMember } from "@/components/campaign/campaign-members";
import { RemoveFromRoster } from "@/components/campaign/remove-from-roster";
import { ArchiveButton, RestoreButton } from "@/components/campaign/archive-controls";
import { DeleteCampaign } from "@/components/campaign/delete-campaign";
import { EditCampaign } from "@/components/campaign/edit-campaign";
import { CampaignModulesEditor } from "@/components/campaign/campaign-modules-editor";

export const metadata: Metadata = { title: "Campaign" };

const GM_ROLES = new Set(["owner", "gm", "assistant_gm"]);

type ComputedSummary = { totalLevel?: number; ac?: number } | null;

export default async function CampaignDashboardPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  // Loading the campaign through RLS IS the authorization gate: only the owner or
  // an active member can read it. If it loads, the viewer is allowed to see the
  // roster, so the admin-client reads below are safe.
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, description, owner_id, enabled_modules")
    .eq("id", campaignId)
    .single();
  if (!campaign) notFound();

  const [{ data: membership }, { data: rosterRows }, { data: memberRows }, { count: openRequests }, { data: myChars }] =
    await Promise.all([
      supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase
        .from("campaign_characters")
        .select("character_id, gm_review_status, approved_snapshot_id, archived_at, archive_reason")
        .eq("campaign_id", campaignId),
      supabase.from("campaign_members").select("user_id, role").eq("campaign_id", campaignId),
      supabase
        .from("character_comments")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "open"),
      supabase.from("characters").select("id, name").eq("owner_id", user.id).eq("is_archived", false).order("name"),
    ]);

  const myRole = membership?.role ?? (campaign.owner_id === user.id ? "owner" : undefined);
  const isGm = myRole ? GM_ROLES.has(myRole) : false;
  // Editing the campaign (name/desc/modules) is RLS-limited to owner + gm (not assistant_gm).
  const canEditCampaign = myRole === "owner" || myRole === "gm";

  const roster = rosterRows ?? [];
  const rosterIds = roster.map((r) => r.character_id);
  const activeRoster = roster.filter((r) => !r.archived_at);
  const archivedRoster = roster.filter((r) => r.archived_at);

  // Admin-client reads: roster character details + display names for owners and
  // members. Authorized above by the RLS-gated campaign load.
  const admin = createAdminClient();
  const memberUserIds = (memberRows ?? []).map((m) => m.user_id);
  const ownerIdsNeeded = new Set<string>(memberUserIds);

  const charById = new Map<
    string,
    { id: string; name: string; owner_id: string; visibility: string; computed_summary: ComputedSummary }
  >();
  if (rosterIds.length) {
    const { data: chars } = await admin
      .from("characters")
      .select("id, name, owner_id, visibility, computed_summary")
      .in("id", rosterIds);
    for (const c of chars ?? []) {
      charById.set(c.id, {
        id: c.id,
        name: c.name,
        owner_id: c.owner_id,
        visibility: c.visibility,
        computed_summary: c.computed_summary as ComputedSummary,
      });
      ownerIdsNeeded.add(c.owner_id);
    }
  }

  const nameByUser = new Map<string, { display_name: string | null; handle: string | null }>();
  if (ownerIdsNeeded.size) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name, handle")
      .in("id", [...ownerIdsNeeded]);
    for (const p of profs ?? []) nameByUser.set(p.id, { display_name: p.display_name, handle: p.handle });
  }

  const members: CampaignMember[] = (memberRows ?? []).map((m) => ({
    userId: m.user_id,
    name: nameByUser.get(m.user_id)?.display_name ?? "Player",
    handle: nameByUser.get(m.user_id)?.handle ?? null,
    role: m.role,
    isOwner: m.role === "owner" || m.user_id === campaign.owner_id,
    isSelf: m.user_id === user.id,
  }));
  // Keep owner(s) first, then GMs, then everyone else.
  const roleOrder: Record<string, number> = { owner: 0, gm: 1, assistant_gm: 2, player: 3, viewer: 4 };
  members.sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));

  const candidates = (myChars ?? []).filter((c) => !rosterIds.includes(c.id));
  const moduleKeys = enabledModuleKeys(campaign.enabled_modules);
  const needsReviewCount = activeRoster.filter((r) => needsReview(r.gm_review_status)).length;

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/campaigns">
          <ArrowLeft className="size-4" /> All campaigns
        </Link>
      </Button>

      <PageHeader
        title={campaign.name}
        description={campaign.description ?? undefined}
        actions={
          isGm ? (
            <Button asChild>
              <Link href={`/campaigns/${campaignId}/gm`}>
                <ShieldCheck className="size-4" /> GM Audit View
                {needsReviewCount > 0 && (
                  <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                    {needsReviewCount}
                  </span>
                )}
              </Link>
            </Button>
          ) : null
        }
      />

      {canEditCampaign && (
        <div className="mb-4">
          <EditCampaign
            campaignId={campaignId}
            name={campaign.name}
            description={campaign.description ?? ""}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Roster */}
        <section className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="size-4 text-gold" /> Roster
              </CardTitle>
              <Badge variant="default">{activeRoster.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeRoster.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active characters. Add one of yours below — players can attach their own once
                  they join.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activeRoster.map((r) => {
                    const char = charById.get(r.character_id);
                    const meta = reviewStatusMeta(r.gm_review_status);
                    const mine = char?.owner_id === user.id;
                    // A non-GM member shouldn't see a private character they don't own —
                    // RLS would hide its sheet, so don't surface its name/level here either.
                    const masked = !isGm && !mine && char?.visibility === "private";
                    const ownerName = char ? nameByUser.get(char.owner_id)?.display_name ?? "Player" : "Player";
                    const level = char?.computed_summary?.totalLevel ?? 0;
                    return (
                      <li
                        key={r.character_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised/40 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {masked ? "Private character" : char?.name ?? "Character"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {masked ? "Hidden by the player" : `Level ${level} · ${mine ? "Yours" : ownerName}`}
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                          <Badge variant={meta.variant} title={meta.hint}>
                            {meta.short}
                          </Badge>
                          {isGm && (
                            <Button asChild variant="secondary" size="sm">
                              <Link href={`/campaigns/${campaignId}/gm/${r.character_id}`}>Review</Link>
                            </Button>
                          )}
                          {mine && !isGm && (
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/characters/${r.character_id}`}>Open</Link>
                            </Button>
                          )}
                          {(isGm || mine) && (
                            <ArchiveButton campaignId={campaignId} characterId={r.character_id} />
                          )}
                          {(isGm || mine) && (
                            <RemoveFromRoster
                              campaignId={campaignId}
                              characterId={r.character_id}
                              characterName={char?.name ?? "this character"}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="border-t border-border pt-3">
                <AddCharacter campaignId={campaignId} candidates={candidates} />
              </div>
            </CardContent>
          </Card>

          {archivedRoster.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Archive className="size-4 text-muted-foreground" /> Archived
                </CardTitle>
                <Badge variant="default">{archivedRoster.length}</Badge>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {archivedRoster.map((r) => {
                    const char = charById.get(r.character_id);
                    const mine = char?.owner_id === user.id;
                    const masked = !isGm && !mine && char?.visibility === "private";
                    const ownerName = char ? nameByUser.get(char.owner_id)?.display_name ?? "Player" : "Player";
                    return (
                      <li
                        key={r.character_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised/20 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-muted-foreground">
                            {masked ? "Private character" : char?.name ?? "Character"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {masked ? "Hidden by the player" : mine ? "Yours" : ownerName}
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                          <Badge variant="warning">{archiveReasonLabel(r.archive_reason)}</Badge>
                          {mine && !isGm && (
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/characters/${r.character_id}`}>Open</Link>
                            </Button>
                          )}
                          {(isGm || mine) && (
                            <RestoreButton campaignId={campaignId} characterId={r.character_id} />
                          )}
                          {(isGm || mine) && (
                            <RemoveFromRoster
                              campaignId={campaignId}
                              characterId={r.character_id}
                              characterName={char?.name ?? "this character"}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {isGm && (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 p-5 text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <ClipboardList className="size-4" /> {needsReviewCount} awaiting review
                </span>
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="size-4" /> {openRequests ?? 0} open change requests
                </span>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Sidebar */}
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-gold" /> Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CampaignMembers campaignId={campaignId} members={members} canManage={isGm} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-gold" /> Rule modules
              </CardTitle>
            </CardHeader>
            <CardContent>
              {canEditCampaign ? (
                <CampaignModulesEditor campaignId={campaignId} enabledKeys={moduleKeys} />
              ) : moduleKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Core rules only. Optional rules &amp; 3pp modules adopted by this campaign will
                  appear here.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {moduleKeys.map((k) => (
                    <Badge key={k} variant="rune">
                      {moduleName(k)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {campaign.owner_id === user.id && (
            <Card className="border-danger/30">
              <CardContent className="p-5">
                <DeleteCampaign campaignId={campaignId} campaignName={campaign.name} />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
