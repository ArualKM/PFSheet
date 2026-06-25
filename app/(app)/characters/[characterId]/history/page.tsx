import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, Camera } from "lucide-react";
import { safeParseCharacter } from "@pathforge/schema";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { diffCharacters } from "@/lib/character/diff";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DiffView } from "@/components/character/diff-view";
import { CreateSnapshotButton, DeleteSnapshotButton } from "@/components/character/snapshot-controls";

export const metadata: Metadata = { title: "History" };

const REASON_LABEL: Record<string, string> = {
  manual: "Manual",
  gm_approval: "GM approval",
  import: "Import",
  level_up: "Level-up",
  formula_reset: "Formula reset",
  session_start: "Session start",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function CharacterHistoryPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: character } = await supabase
    .from("characters")
    .select("id, name, owner_id, sheet_data")
    .eq("id", characterId)
    .single();
  if (!character) notFound();

  // Snapshot history is an owner/editor tool (creating snapshots needs edit
  // rights). Don't expose it — or its content diffs — to viewers who merely
  // can_view the sheet (public/campaign/party), since diffs aren't section-gated
  // for the owner view used here.
  let canEdit = character.owner_id === user.id;
  if (!canEdit) {
    const { data: collab } = await supabase
      .from("character_collaborators")
      .select("role")
      .eq("character_id", characterId)
      .eq("user_id", user.id)
      .maybeSingle();
    canEdit = collab?.role === "editor" || collab?.role === "co_owner";
  }
  if (!canEdit) notFound();

  const { data: snapshotRows } = await supabase
    .from("character_snapshots")
    .select("id, label, reason, created_at, sheet_data")
    .eq("character_id", characterId)
    .order("created_at", { ascending: false })
    .limit(25);

  const current = safeParseCharacter(character.sheet_data);
  const snapshots = snapshotRows ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={`/characters/${characterId}`}>
          <ArrowLeft className="size-4" /> {character.name}
        </Link>
      </Button>

      <PageHeader
        title="Snapshot history"
        description="Frozen copies of this sheet. Compare any snapshot to the current sheet to see exactly what changed."
        actions={<CreateSnapshotButton characterId={characterId} />}
      />

      {snapshots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-gold/10 text-gold">
              <Camera className="size-6" />
            </span>
            <h2 className="text-lg font-semibold text-foreground">No snapshots yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Create a snapshot before a level-up, a big shopping trip, or a respec — then you can
              always see what changed since.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {snapshots.map((s) => {
            const snapParsed = safeParseCharacter(s.sheet_data);
            const diff = current.ok && snapParsed.ok ? diffCharacters(snapParsed.character, current.character) : null;
            return (
              <li key={s.id}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <History className="size-4 text-gold" />
                        <span className="font-medium text-foreground">{s.label}</span>
                        <Badge variant="default">{REASON_LABEL[s.reason ?? "manual"] ?? s.reason}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDateTime(s.created_at)}</span>
                        <DeleteSnapshotButton characterId={characterId} snapshotId={s.id} label={s.label} />
                      </div>
                    </div>
                    {diff && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-rune hover:underline">
                          {diff.hasChanges
                            ? `Compare to current (${diff.values.length + diff.lists.length} change${
                                diff.values.length + diff.lists.length === 1 ? "" : "s"
                              })`
                            : "No changes since this snapshot"}
                        </summary>
                        {diff.hasChanges && (
                          <div className="mt-3 border-t border-border pt-3">
                            <DiffView diff={diff} />
                          </div>
                        )}
                      </details>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
