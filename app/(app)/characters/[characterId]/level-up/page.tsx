import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readLevelUpMeta, readWizardMeta } from "@pathforge/schema";
import { loadCharacterForEdit } from "@/lib/character/load-for-edit";
import { LevelUpWizard } from "@/components/character/wizard/level-up/level-up-wizard";
import { startLevelUpAction, reopenLevelUpAction } from "@/lib/actions/characters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Level up your character" };

/**
 * Level-Up Wizard Stage 7 (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "Entry points" + "Risks" —
 * "mid-level-up abandonment must not be a dead end"). Mirrors `wizard/page.tsx`'s structure exactly:
 * the same `loadCharacterForEdit` preamble, a parse failure still falls back to `/edit` (nothing
 * safe to render here), and an inactive session renders an interstitial rather than redirecting away
 * — the 2026-07-11 create-wizard fix that made THAT page reachable again is a precedent this route
 * must ship WITH from day one, not retrofit after an owner reports the same dead end twice.
 *
 * Unlike the create wizard's single "inactive = closed" interstitial, this route distinguishes THREE
 * states, because `levelUpMeta.completedAt` carries real meaning the create wizard's flag doesn't
 * need to branch on:
 *
 * 1. `meta?.active` — render the wizard directly. This covers the realistic "browser closed
 *    mid-session" case: `active` stays `true` on the server (Finish is the only thing that flips it),
 *    so a returning player lands straight back in `<LevelUpWizard>`, no interstitial at all.
 * 2. `meta` exists, inactive, NO `completedAt` — an explicitly-abandoned session. No code path in
 *    THIS stage actually produces it today (Finish is the only writer of `active: false`, and it
 *    always sets `completedAt` in the same patch) — it's handled anyway, defensively, for a future
 *    "save & exit without finishing" affordance or a hand-edited/imported sheet, the same
 *    never-a-dead-end discipline `wizard/page.tsx` already applies. Copy: "paused", Resume (posts
 *    `reopenLevelUpAction`, preserving the session's baseline) alongside "Start over instead" (posts
 *    `startLevelUpAction`, which re-baselines from the character's CURRENT level).
 * 3. `meta` absent, or present with `completedAt` set (a finished prior session) — the character has
 *    no reason to think it's mid-level-up. "Level up {name}" copy, a single Start button.
 *
 * A live create-wizard session (mutual exclusion, "The flag design") steers each of states 2/3 —
 * see `guidedSetupNotice` below for the visible-not-silent reasoning.
 */
export default async function LevelUpPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const { data, result, sheetVersion } = await loadCharacterForEdit(characterId);

  if (!result.ok) {
    redirect(`/characters/${characterId}/edit`);
  }

  const meta = readLevelUpMeta(result.character);
  const wizardActive = readWizardMeta(result.character)?.active === true;

  if (meta?.active) {
    return <LevelUpWizard characterId={characterId} initial={result.character} initialVersion={sheetVersion} />;
  }

  const backToSheet = (
    <Button asChild variant="ghost">
      <Link href={`/characters/${characterId}`}>Back to the sheet</Link>
    </Button>
  );

  // Mutual exclusion (The flag design): a live create-wizard session steers here INSTEAD OF any
  // start/resume button — visible reasoning + a link, never a silently-disabled control (the
  // WizardFooter gate-hint discipline: never a `title` tooltip, which is unreachable for touch/SR
  // users). Both `startLevelUpAction` and `reopenLevelUpAction` still enforce this server-side
  // regardless (the former redirects away on its own; see its doc comment) — this is belt-and-braces
  // UI, not the only guard.
  const guidedSetupNotice = (
    <p className="text-xs text-muted-foreground">
      Guided setup is still in progress for this character —{" "}
      <Link href={`/characters/${characterId}/wizard`} className="font-medium text-rune underline underline-offset-2">
        finish that first
      </Link>
      , then come back to level up.
    </p>
  );

  // State 2 — abandoned mid-session (inactive, no completedAt): offer both Resume and Start over.
  if (meta && !meta.completedAt) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-lg">Level-up in progress is paused</CardTitle>
            <CardDescription>
              You started leveling up {data.name} and stepped away before finishing. Pick up where
              you left off, or start this level-up over from the character&rsquo;s current level.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            {wizardActive ? (
              guidedSetupNotice
            ) : (
              <>
                <form action={reopenLevelUpAction.bind(null, characterId)} className="w-full">
                  <Button type="submit" className="w-full">
                    Resume level-up
                  </Button>
                </form>
                <form action={startLevelUpAction.bind(null, characterId)} className="w-full">
                  <Button type="submit" variant="ghost" className="w-full">
                    Start over instead
                  </Button>
                </form>
              </>
            )}
            {backToSheet}
          </CardContent>
        </Card>
      </div>
    );
  }

  // State 3 — no session, or a finished one: a single, honest "start a level-up" offer.
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-lg">Level up {data.name}</CardTitle>
          <CardDescription>
            Walks you through classes, HP, skills, feats, ability increases, and spells — you can
            close it anytime and pick up where you left off.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2">
          {wizardActive ? (
            guidedSetupNotice
          ) : (
            <form action={startLevelUpAction.bind(null, characterId)} className="w-full">
              <Button type="submit" className="w-full">
                Start level-up
              </Button>
            </form>
          )}
          {backToSheet}
        </CardContent>
      </Card>
    </div>
  );
}
