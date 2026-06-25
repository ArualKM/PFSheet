import type { Metadata } from "next";
import { Search, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Spell Compendium" };

const SCHOOLS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
  "Universal",
];

const PAGE_SIZE = 40;

type SpellRow = {
  id: string;
  name: string;
  school: string;
  subschool: string | null;
  descriptor: string | null;
  class_levels: Record<string, number> | null;
  casting_time: string | null;
  components: string | null;
  range: string | null;
  duration: string | null;
  saving_throw: string | null;
  spell_resistance: string | null;
  source: string | null;
  description: string | null;
};

function minLevel(classLevels: Record<string, number> | null): number | null {
  if (!classLevels) return null;
  const vals = Object.values(classLevels).filter((v) => typeof v === "number");
  return vals.length ? Math.min(...vals) : null;
}

export default async function SpellsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; school?: string; page?: string }>;
}) {
  await requireUser();
  const { q = "", school = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("spell_compendium")
    .select(
      "id,name,school,subschool,descriptor,class_levels,casting_time,components,range,duration,saving_throw,spell_resistance,source,description",
      { count: "exact" },
    );

  if (q.trim()) query = query.textSearch("search_vector", q.trim(), { type: "websearch" });
  if (school) query = query.eq("school", school);

  const { data, count, error } = await query
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const spells = (data ?? []) as SpellRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (school) sp.set("school", school);
    sp.set("page", String(p));
    return `/spells?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Spell Compendium"
        description={`Search ${total ? total.toLocaleString() : "thousands of"} Pathfinder 1e spells by name, school, and class.`}
      />

      <form method="get" className="mb-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search spells, e.g. fireball, cure, haste…"
            className="pl-9"
            aria-label="Search spells"
          />
        </div>
        <select
          name="school"
          defaultValue={school}
          aria-label="Filter by school"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          <option value="">All schools</option>
          {SCHOOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
      </form>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-danger">
            Could not load spells: {error.message}
          </CardContent>
        </Card>
      ) : spells.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Sparkles className="size-6 text-gold" />
            <p className="text-sm text-muted-foreground">
              No spells match your search. Try a different term or clear the school filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {spells.map((spell) => {
            const lvl = minLevel(spell.class_levels);
            const classes = Object.keys(spell.class_levels ?? {}).slice(0, 6);
            return (
              <Card key={spell.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{spell.name}</h2>
                    <Badge variant="rune">{spell.school}</Badge>
                    {spell.subschool && <Badge>{spell.subschool}</Badge>}
                    {lvl !== null && <Badge variant="gold">Lvl {lvl}</Badge>}
                    {spell.source && (
                      <span className="ml-auto text-xs text-muted-foreground">{spell.source}</span>
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    <SpellMeta label="Casting" value={spell.casting_time} />
                    <SpellMeta label="Components" value={spell.components} />
                    <SpellMeta label="Range" value={spell.range} />
                    <SpellMeta label="Duration" value={spell.duration} />
                    <SpellMeta label="Save" value={spell.saving_throw} />
                    <SpellMeta label="SR" value={spell.spell_resistance} />
                  </dl>

                  {classes.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Classes:</span> {classes.join(", ")}
                    </p>
                  )}

                  {spell.description && (
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {spell.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <div className="flex items-center justify-between pt-2 text-sm">
            <span className="text-muted-foreground">
              Page {pageNum} of {totalPages}
            </span>
            <div className="flex gap-2">
              {pageNum > 1 && (
                <Button asChild variant="secondary" size="sm">
                  <a href={pageHref(pageNum - 1)}>Previous</a>
                </Button>
              )}
              {pageNum < totalPages && (
                <Button asChild variant="secondary" size="sm">
                  <a href={pageHref(pageNum + 1)}>Next</a>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpellMeta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-medium text-foreground">{label}:</span> {value}
    </div>
  );
}
