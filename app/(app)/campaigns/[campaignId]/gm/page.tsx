import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCampaignRole } from "@/lib/character/gm-access";
import { reviewStatusMeta, needsReview } from "@/lib/character/review-status";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "GM Audit View" };

type ComputedSummary = { totalLevel?: number } | null;

export default async function GmQueuePage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const ctx = await resolveCampaignRole(supabase, campaignId, user.id);
  if (!ctx) notFound();
  if (!ctx.isGm) notFound(); // Only campaign GMs reach the audit view.

  const { data: rosterRows } = await supabase
    .from("campaign_characters")
    .select("character_id, gm_review_status")
    .eq("campaign_id", campaignId);
  const roster = rosterRows ?? [];
  const ids = roster.map((r) => r.character_id);

  const admin = createAdminClient();
  const charById = new Map<string, { name: string; owner_id: string; computed_summary: ComputedSummary }>();
  const ownerIds = new Set<string>();
  if (ids.length) {
    const { data: chars } = await admin
      .from("characters")
      .select("id, name, owner_id, computed_summary")
      .in("id", ids);
    for (const c of chars ?? []) {
      charById.set(c.id, { name: c.name, owner_id: c.owner_id, computed_summary: c.computed_summary as ComputedSummary });
      ownerIds.add(c.owner_id);
    }
  }
  const ownerName = new Map<string, string>();
  if (ownerIds.size) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", [...ownerIds]);
    for (const p of profs ?? []) ownerName.set(p.id, p.display_name ?? "Player");
  }

  // Sort: needs-attention first, then by name.
  const sorted = [...roster].sort((a, b) => {
    const an = needsReview(a.gm_review_status) ? 0 : 1;
    const bn = needsReview(b.gm_review_status) ? 0 : 1;
    if (an !== bn) return an - bn;
    return (charById.get(a.character_id)?.name ?? "").localeCompare(charById.get(b.character_id)?.name ?? "");
  });

  const pendingCount = roster.filter((r) => needsReview(r.gm_review_status)).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={`/campaigns/${campaignId}`}>
          <ArrowLeft className="size-4" /> {ctx.campaign.name}
        </Link>
      </Button>

      <PageHeader
        title="GM Audit View"
        description={`Review characters in ${ctx.campaign.name}. You can audit and comment, but never edit a player's sheet.`}
      />

      <Card>
        <CardContent className="p-5">
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No characters on the roster yet. Players attach their characters from the campaign
              page.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-gold" />
                {pendingCount} of {roster.length} awaiting review
              </div>
              <ul className="space-y-2">
                {sorted.map((r) => {
                  const char = charById.get(r.character_id);
                  const meta = reviewStatusMeta(r.gm_review_status);
                  return (
                    <li key={r.character_id}>
                      <Link
                        href={`/campaigns/${campaignId}/gm/${r.character_id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/40 px-4 py-3 transition-colors hover:border-gold/40"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{char?.name ?? "Character"}</div>
                          <div className="text-xs text-muted-foreground">
                            Level {char?.computed_summary?.totalLevel ?? 0} · {ownerName.get(char?.owner_id ?? "") ?? "Player"}
                          </div>
                        </div>
                        <Badge variant={meta.variant} title={meta.hint}>
                          {meta.label}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
