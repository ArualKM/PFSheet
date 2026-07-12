import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { syncMasterFamiliars } from "@/lib/character/companion-sync-server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { loadCampaignFeedback } from "@/lib/character/campaign-feedback";
import { CharacterDashboard } from "@/components/character/character-dashboard";
import { ClassicSheet } from "@/components/character/classic-sheet";
import { CompanionSheet } from "@/components/character/companion-sheet";
import { SheetViewSwitch } from "@/components/character/sheet-view-switch";
import { CampaignFeedback } from "@/components/character/campaign-feedback";
import { CompanionsCard } from "@/components/character/companions-card";
import { DeleteCharacterDialog } from "@/components/character/delete-character-dialog";
import { ShareControls } from "@/components/character/share-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Character" };

type Visibility = "private" | "campaign" | "unlisted" | "public";

export default async function CharacterOverviewPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const user = await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, visibility, public_slug, owner_id, sheet_data")
    .eq("id", characterId)
    .single();

  if (error || !data) notFound();

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href="/characters">
        <ArrowLeft className="size-4" /> All characters
      </Link>
    </Button>
  );

  const result = safeParseCharacter(data.sheet_data);
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        {backLink}
        <Card className="border-dashed">
          <CardContent className="px-6 py-12 text-center">
            <p className="mb-1 font-semibold text-foreground">This sheet couldn&rsquo;t be loaded</p>
            <p className="text-sm text-muted-foreground">
              Its data doesn&rsquo;t match the current character schema and may need migration.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // GM feedback is owner-facing; only load it for the character's owner.
  const isOwner = data.owner_id === user.id;

  // Companions (linked character rows) — owner-only. A companion isn't itself a companion-parent here.
  const companions = isOwner
    ? ((await supabase.from("characters").select("id, name, companion_type").eq("parent_character_id", characterId).order("created_at")).data ?? [])
    : [];

  // MASTER side: rebuild + apply the benefits this character's linked familiars grant it (Alertness +
  // each familiar's specific bonus) and persist the cache. Self-heals create/edit/delete drift for the
  // editor/API too. Only for the owner (they can read the children); non-owners fall back to the
  // persisted cache on the sheet. Gated so non-master characters skip the extra reads.
  if (isOwner && (companions.some((c) => c.companion_type === "familiar") || result.character.familiars?.length)) {
    try {
      const benefits = await syncMasterFamiliars(characterId);
      result.character.familiars = benefits.length ? benefits : undefined;
    } catch (e) {
      console.error("overview: master familiar sync failed", e);
    }
  }

  const computed = computeCharacter(result.character);
  const vm = buildCharacterViewModel(result.character, computed, "owner", data.visibility);
  // Derived from the GATED view-model (not the raw sheet) so the companion view/pill obeys the §15
  // "companion" section privacy like everything else it shows.
  const isCompanion = Boolean(vm.companion);

  const feedback = isOwner ? await loadCampaignFeedback(characterId, user.id, result.character) : [];

  const actions = (
    <>
      <ShareControls
        characterId={data.id}
        initialVisibility={data.visibility as Visibility}
        initialSlug={data.public_slug}
        appUrl={env.appUrl}
      />
      <Button asChild variant="ghost" size="sm">
        <Link href={`/characters/${characterId}/history`}>History</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/characters/${characterId}/exports`}>Export</Link>
      </Button>
      <Button asChild size="sm">
        <Link href={`/characters/${characterId}/edit`}>Edit</Link>
      </Button>
    </>
  );

  return (
    <div className="mx-auto max-w-5xl">
      {backLink}
      <SheetViewSwitch
        characterId={data.id}
        modern={<CharacterDashboard vm={vm} actions={actions} />}
        classic={<ClassicSheet vm={vm} actions={actions} />}
        companion={isCompanion ? <CompanionSheet vm={vm} actions={actions} /> : undefined}
        defaultView={isCompanion ? "companion" : undefined}
      />
      <CampaignFeedback items={feedback} characterId={characterId} />
      {isOwner && <CompanionsCard parentId={characterId} companions={companions} />}
      {isOwner && (
        <Card className="mt-4 border-danger/30">
          <CardContent className="p-5">
            <h2 className="mb-3 text-base font-semibold text-foreground">Danger zone</h2>
            <DeleteCharacterDialog
              characterId={data.id}
              characterName={data.name}
              companionCount={companions.length}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
