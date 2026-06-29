import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { ScrollText } from "@/components/ui/game-icons";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Characters" };

type CharacterRow = {
  id: string;
  name: string;
  visibility: string;
  computed_summary: { totalLevel?: number; ac?: number; hp?: { current?: number; max?: number } } | null;
  updated_at: string;
};

export default async function CharactersPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("id, name, visibility, computed_summary, updated_at")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  const characters = (data ?? []) as CharacterRow[];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Characters"
        description="Every hero you've forged. Owner-only by default — share when you're ready."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/characters/import">
                <Upload className="size-4" /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/characters/new">
                <Plus className="size-4" /> New character
              </Link>
            </Button>
          </>
        }
      />

      {characters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-gold/10 text-gold">
              <ScrollText className="size-6" />
            </span>
            <h2 className="text-lg font-semibold text-foreground">No characters yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Start with a blank PF1e sheet — all six abilities, the full skill list, and default
              formulas are set up for you.
            </p>
            <Button asChild className="mt-2">
              <Link href="/characters/new">
                <Plus className="size-4" /> Create your first character
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {characters.map((c) => (
            <Link key={c.id} href={`/characters/${c.id}`}>
              <Card className="transition-colors hover:border-gold/40">
                <CardContent className="flex items-center justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{c.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Level {c.computed_summary?.totalLevel ?? 0}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="tnum text-lg font-semibold text-foreground">
                        {c.computed_summary?.ac ?? "—"}
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        AC
                      </div>
                    </div>
                    <Badge variant={c.visibility === "public" ? "rune" : "default"} className="capitalize">
                      {c.visibility}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
