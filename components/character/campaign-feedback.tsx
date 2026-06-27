import Link from "next/link";
import { MessageSquare, StickyNote, Puzzle, ShieldCheck } from "lucide-react";
import type { CampaignFeedbackItem } from "@/lib/character/campaign-feedback";
import { reviewStatusMeta } from "@/lib/character/review-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResolveRequestButton, AdoptModulesButton } from "./feedback-actions";

/**
 * Player-facing GM feedback (§17.3). Shows, per campaign the character is on, the
 * review status, open change requests (with "mark addressed"), player-visible
 * notes, and any campaign rule modules the character hasn't adopted (§17.2).
 */
export function CampaignFeedback({
  items,
  characterId,
}: {
  items: CampaignFeedbackItem[];
  characterId: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-6 space-y-4">
      <h2 className="font-display text-lg font-semibold text-foreground">Campaign reviews</h2>
      {items.map((it) => {
        const meta = reviewStatusMeta(it.status);
        const nothing =
          it.openRequests.length === 0 &&
          it.playerNotes.length === 0 &&
          it.missingModules.length === 0 &&
          !it.reviewSummary;
        return (
          <Card key={it.campaignId}>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="flex min-w-0 items-center gap-2">
                <ShieldCheck className="size-4 shrink-0 text-gold" />
                <Link href={`/campaigns/${it.campaignId}`} className="min-w-0 truncate hover:underline">
                  {it.campaignName}
                </Link>
              </CardTitle>
              <Badge variant={meta.variant} title={meta.hint} className="shrink-0">
                {meta.label}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {it.reviewSummary && (
                <p className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2 text-sm text-muted-foreground">
                  &ldquo;{it.reviewSummary}&rdquo;
                </p>
              )}

              {it.openRequests.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <MessageSquare className="size-4 text-warning" /> Change requests
                  </h3>
                  {it.openRequests.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        {r.targetPath && <code className="text-xs text-rune">{r.targetPath}</code>}
                        <p className="text-foreground">{r.body}</p>
                      </div>
                      <ResolveRequestButton commentId={r.id} campaignId={it.campaignId} characterId={characterId} />
                    </div>
                  ))}
                </div>
              )}

              {it.playerNotes.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <StickyNote className="size-4 text-gold" /> Notes from the GM
                  </h3>
                  {it.playerNotes.map((n) => (
                    <p
                      key={n.id}
                      className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2 text-sm text-foreground"
                    >
                      {n.body}
                    </p>
                  ))}
                </div>
              )}

              {it.missingModules.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rune/30 bg-rune/5 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Puzzle className="size-4 text-rune" /> Campaign rules not on your sheet
                    </span>
                    <p className="text-muted-foreground">{it.missingModules.map((m) => m.name).join(", ")}</p>
                  </div>
                  <AdoptModulesButton characterId={characterId} campaignId={it.campaignId} count={it.missingModules.length} />
                </div>
              )}

              {nothing && <p className="text-sm text-muted-foreground">No feedback from the GM yet.</p>}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
