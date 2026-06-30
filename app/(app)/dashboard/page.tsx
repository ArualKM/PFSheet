import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { ScrollText, Swords, Sparkles } from "@/components/ui/game-icons";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Dashboard" };

type TableName = keyof Database["public"]["Tables"];

async function safeCount(table: TableName): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [characters, campaigns] = await Promise.all([
    safeCount("characters"),
    safeCount("campaigns"),
  ]);

  const firstName = (user.displayName || user.email || "Adventurer").split(/[ @]/)[0];

  const stats = [
    { label: "Characters", value: characters, href: "/characters", icon: ScrollText },
    { label: "Campaigns", value: campaigns, href: "/campaigns", icon: Swords },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your command center. Create a character, browse the compendium, or pick up where you left off."
        actions={
          <Button asChild>
            <Link href="/characters/new">
              <Plus className="size-4" /> New character
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, href, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-surface-raised text-gold">
                <Icon className="size-5" />
              </span>
              <div>
                <div className="tnum text-2xl font-semibold text-foreground">
                  {value === null ? "—" : value}
                </div>
                <Link href={href} className="text-sm text-muted-foreground hover:text-rune">
                  {label}
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed">
          <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
            <div className="flex items-center gap-2 text-gold">
              <Sparkles className="size-5" />
              <span className="font-semibold">Compendium</span>
            </div>
            <p className="text-sm text-muted-foreground">
              The complete PF1e reference — feats, spells, races, archetypes, spheres &amp; more, ready to
              drop onto your sheet.
            </p>
            <Link
              href="/compendium"
              className="inline-flex items-center gap-1 text-sm font-medium text-rune hover:underline"
            >
              Open compendium <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {characters === 0 && (
        <Card className="mt-6 border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-gold/10 text-gold">
              <ScrollText className="size-6" />
            </span>
            <h2 className="text-lg font-semibold text-foreground">No characters yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Forge your first Pathfinder 1e character. You can start from scratch or import from
              Foundry, Hero Lab, or a PDF later.
            </p>
            <Button asChild className="mt-2">
              <Link href="/characters/new">
                <Plus className="size-4" /> Create a character
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
