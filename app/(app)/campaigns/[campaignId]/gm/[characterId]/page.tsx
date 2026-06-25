import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Lock } from "lucide-react";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCampaignRole, isCharacterInRoster } from "@/lib/character/gm-access";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { auditCharacter } from "@/lib/character/audit";
import { reviewStatusMeta } from "@/lib/character/review-status";
import { CharacterDashboard } from "@/components/character/character-dashboard";
import { AuditReport } from "@/components/campaign/audit-report";
import { GmReviewPanel } from "@/components/campaign/gm-review-panel";
import { CommentControls } from "@/components/campaign/comment-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Character review" };

const NOTE_VISIBILITY_LABEL: Record<string, string> = {
  gm_only: "GM only",
  player_visible: "Player visible",
  party_visible: "Party visible",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function GmCharacterReviewPage({
  params,
}: {
  params: Promise<{ campaignId: string; characterId: string }>;
}) {
  const { campaignId, characterId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const ctx = await resolveCampaignRole(supabase, campaignId, user.id);
  if (!ctx || !ctx.isGm) notFound();
  if (!(await isCharacterInRoster(supabase, campaignId, characterId))) notFound();

  // Authorized as GM above → read the (possibly private) sheet via the admin client.
  const admin = createAdminClient();
  const { data: charRow } = await admin
    .from("characters")
    .select("id, name, visibility, owner_id, updated_at, sheet_data")
    .eq("id", characterId)
    .single();
  if (!charRow) notFound();

  const backToQueue = (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href={`/campaigns/${campaignId}/gm`}>
        <ArrowLeft className="size-4" /> Review queue
      </Link>
    </Button>
  );

  const parsed = safeParseCharacter(charRow.sheet_data);
  if (!parsed.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        {backToQueue}
        <Card className="border-dashed">
          <CardContent className="px-6 py-12 text-center">
            <p className="mb-1 font-semibold text-foreground">This sheet couldn&rsquo;t be loaded</p>
            <p className="text-sm text-muted-foreground">
              Its data doesn&rsquo;t match the current schema, so it can&rsquo;t be audited yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const computed = computeCharacter(parsed.character);
  const vm = buildCharacterViewModel(parsed.character, computed, "gm", charRow.visibility);
  const audit = auditCharacter(parsed.character, computed, "gm");

  const [{ data: ccRow }, { data: latestReview }, { data: noteRows }, { data: commentRows }, { data: ownerProfile }] =
    await Promise.all([
      supabase
        .from("campaign_characters")
        .select("gm_review_status, approved_snapshot_id")
        .eq("campaign_id", campaignId)
        .eq("character_id", characterId)
        .maybeSingle(),
      supabase
        .from("gm_reviews")
        .select("status, checklist, summary, created_at")
        .eq("campaign_id", campaignId)
        .eq("character_id", characterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("gm_notes")
        .select("id, body, visibility, created_at")
        .eq("campaign_id", campaignId)
        .eq("character_id", characterId)
        .order("created_at", { ascending: false }),
      supabase
        .from("character_comments")
        .select("id, body, target_path, status, created_at")
        .eq("character_id", characterId)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("display_name").eq("id", charRow.owner_id).maybeSingle(),
    ]);

  const status = ccRow?.gm_review_status ?? "unreviewed";
  const statusMeta = reviewStatusMeta(status);
  const initialChecklist = (latestReview?.checklist ?? {}) as Record<string, boolean>;

  // Stale detection (§16.3): edited after the approved snapshot was taken.
  let changedSinceApproval = false;
  let approvedAt: string | null = null;
  if (ccRow?.approved_snapshot_id) {
    const { data: snap } = await admin
      .from("character_snapshots")
      .select("created_at")
      .eq("id", ccRow.approved_snapshot_id)
      .maybeSingle();
    approvedAt = snap?.created_at ?? null;
    if (approvedAt && charRow.updated_at && new Date(charRow.updated_at) > new Date(approvedAt)) {
      changedSinceApproval = true;
    }
  }

  const openComments = (commentRows ?? []).filter((c) => c.status === "open");
  const resolvedComments = (commentRows ?? []).filter((c) => c.status !== "open");
  const ownerName = ownerProfile?.display_name ?? "Player";

  return (
    <div className="mx-auto max-w-6xl">
      {backToQueue}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {charRow.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ownerName}&rsquo;s character · <span className="inline-flex items-center gap-1"><Lock className="size-3" /> read-only review</span>
          </p>
        </div>
        <Badge variant={statusMeta.variant} title={statusMeta.hint}>
          {statusMeta.label}
        </Badge>
      </div>

      {changedSinceApproval && (
        <Card className="mb-4 border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            This sheet was edited after it was approved on {formatDate(approvedAt)}. Re-review is
            recommended.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <CharacterDashboard vm={vm} />
          <AuditReport audit={audit} />
        </div>

        <aside className="space-y-6">
          <GmReviewPanel
            campaignId={campaignId}
            characterId={characterId}
            initialChecklist={initialChecklist}
            currentStatus={status}
          />

          {/* Open change requests */}
          {openComments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Open change requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {openComments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {c.target_path && <code className="text-xs text-rune">{c.target_path}</code>}
                        <p className="text-foreground">{c.body}</p>
                      </div>
                      <CommentControls commentId={c.id} campaignId={campaignId} characterId={characterId} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {(noteRows ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(noteRows ?? []).map((n) => (
                  <div key={n.id} className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Badge variant="default">{NOTE_VISIBILITY_LABEL[n.visibility] ?? n.visibility}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(n.created_at)}</span>
                    </div>
                    <p className="text-foreground">{n.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Resolved/dismissed history */}
          {resolvedComments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Resolved requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {resolvedComments.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span className="truncate line-through">{c.body}</span>
                    <Badge variant="default">{c.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
