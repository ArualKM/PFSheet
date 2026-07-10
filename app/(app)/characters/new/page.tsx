import type { Metadata } from "next";
import { Sparkles, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateCharacterForm } from "@/components/characters/create-character-form";
import { WizardCreateForm } from "@/components/characters/wizard-create-form";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "New character" };

/**
 * S6 Pillar 3 §4.1 — the create-character choice. Both cards create a real character row
 * immediately (no separate "draft" concept); they only differ in which page they redirect to next.
 * A zero-character account sees "Guided setup" first/emphasized; everyone else still gets it, just
 * not as the default emphasis (a returning player usually wants the blank sheet they already know).
 */
export default async function NewCharacterPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("characters")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  // Fail CLOSED to the experienced default: on a count error we must not wrongly badge "Guided
  // setup" as recommended for a returning player — and log it so a systemic failure is visible.
  if (countError) console.error("characters/new: owner character count failed", countError);
  const isFirstCharacter = !countError && (count ?? 0) === 0;

  const guidedCard = (
    <Card key="guided" className={cn(isFirstCharacter && "border-gold/60 shadow-[0_0_0_1px_rgba(240,179,90,0.25)]")}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
            <Sparkles className="size-5" />
          </span>
          <CardTitle className="text-lg">Guided setup</CardTitle>
          {isFirstCharacter && (
            <Badge variant="gold" className="ml-auto">
              Recommended
            </Badge>
          )}
        </div>
        <CardDescription>
          New to Pathfinder? We&rsquo;ll walk you through race, class, abilities, skills, and gear
          one step at a time — with plain-language help and sensible defaults along the way.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <WizardCreateForm />
      </CardContent>
    </Card>
  );

  const blankCard = (
    <Card key="blank">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-sunken text-muted-foreground">
            <FileText className="size-5" />
          </span>
          <CardTitle className="text-lg">Blank character</CardTitle>
        </div>
        <CardDescription>
          Start with a blank Pathfinder 1e sheet — abilities, skills, and default formulas are ready
          to go. Best if you already know what you&rsquo;re building.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <CreateCharacterForm />
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New character"
        description="Start guided, or jump straight into a blank sheet — either way you get a real, playable character right away."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {isFirstCharacter ? [guidedCard, blankCard] : [blankCard, guidedCard]}
      </div>
    </div>
  );
}
