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
  parent_character_id: string | null;
  companion_type: string | null;
};

const COMPANION_LABEL: Record<string, string> = {
  animal_companion: "Animal Companion",
  familiar: "Familiar",
  eidolon: "Eidolon",
  cohort: "Cohort",
  mount: "Mount",
  other: "Companion",
};

export default async function CharactersPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("id, name, visibility, computed_summary, updated_at, parent_character_id, companion_type")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  const all = (data ?? []) as CharacterRow[];
  // Companions nest under their parent's card; a companion whose parent isn't in the list
  // (deleted parent → FK set null keeps it top-level anyway; archived parent) stays top-level.
  const topLevelIds = new Set(all.filter((c) => !c.parent_character_id).map((c) => c.id));
  const characters = all.filter((c) => !c.parent_character_id || !topLevelIds.has(c.parent_character_id));
  const companionsOf = (parentId: string) => all.filter((c) => c.parent_character_id === parentId);

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
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {characters.map((c) => {
            // Only TRUE top-level cards nest companions — a fallback card (companion whose parent
            // is absent) must not nest, or its children would render twice (nested + top-level).
            const linked = topLevelIds.has(c.id) ? companionsOf(c.id) : [];
            return (
              <div key={c.id}>
                <Link href={`/characters/${c.id}`}>
                  <Card className="transition-colors hover:border-gold/40">
                    <CardContent className="flex items-center justify-between gap-3 p-5">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{c.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Level {c.computed_summary?.totalLevel ?? 0}
                          {c.companion_type && (
                            <span className="ml-1.5 text-xs">
                              · {COMPANION_LABEL[c.companion_type] ?? "Companion"}
                            </span>
                          )}
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
                {linked.length > 0 && (
                  <ul className="ml-4 border-l border-border/60 pl-3 pt-1.5">
                    {linked.map((comp) => (
                      <li key={comp.id} className="py-0.5">
                        <Link
                          href={`/characters/${comp.id}`}
                          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-raised"
                        >
                          <span className="min-w-0 truncate font-medium text-foreground">{comp.name}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              L{comp.computed_summary?.totalLevel ?? 0} · AC {comp.computed_summary?.ac ?? "—"}
                            </span>
                            <Badge variant="gold" className="text-[10px]">
                              {COMPANION_LABEL[comp.companion_type ?? ""] ?? "Companion"}
                            </Badge>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
