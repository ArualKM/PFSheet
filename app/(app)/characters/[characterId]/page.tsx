import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Heart, Shield, Swords, Zap } from "lucide-react";
import { safeParseCharacter, ABILITY_KEYS, type AbilityKey } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatModifier } from "@/lib/utils";

export const metadata: Metadata = { title: "Character" };

const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export default async function CharacterOverviewPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, visibility, sheet_data")
    .eq("id", characterId)
    .single();

  if (error || !data) notFound();

  const result = safeParseCharacter(data.sheet_data);
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/characters">
            <ArrowLeft className="size-4" /> All characters
          </Link>
        </Button>
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
  const parsed = result.character;
  const computed = computeCharacter(parsed);

  const classLine =
    parsed.identity.classes.map((c) => `${c.name} ${c.level}`).join(" / ") || "Unleveled";
  const raceLine = [parsed.identity.race, parsed.identity.alignment].filter(Boolean).join(" · ");

  const topSkills = Object.entries(computed.skills)
    .map(([key, v]) => ({
      key,
      label: parsed.skills.list.find((s) => s.key === key)?.label ?? key,
      value: v.value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/characters">
          <ArrowLeft className="size-4" /> All characters
        </Link>
      </Button>

      {/* Hero */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              {parsed.identity.name}
            </h1>
            <Badge variant={data.visibility === "public" ? "rune" : "default"}>
              {data.visibility}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {classLine}
            {raceLine && <span className="text-muted-foreground/70"> — {raceLine}</span>}
          </p>
          {parsed.profile.quote && (
            <p className="mt-2 max-w-xl text-sm italic text-muted-foreground">
              “{parsed.profile.quote}”
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/characters/${characterId}/edit`}>Edit</Link>
          </Button>
        </div>
      </div>

      {/* Core combat stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox icon={Heart} label="Hit Points" value={`${computed.summary.hp.current}/${computed.summary.hp.max}`} accent="danger" />
        <StatBox icon={Shield} label="Armor Class" value={computed.summary.ac} sub={`Touch ${computed.summary.touch} · FF ${computed.summary.flatFooted}`} accent="gold" />
        <StatBox icon={Swords} label="CMD" value={computed.summary.cmd} />
        <StatBox icon={Zap} label="Initiative" value={formatModifier(computed.summary.initiative)} accent="rune" />
      </div>

      {/* Saves + abilities */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Saving Throws
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <SaveBox label="Fortitude" value={computed.summary.fortitude} />
              <SaveBox label="Reflex" value={computed.summary.reflex} />
              <SaveBox label="Will" value={computed.summary.will} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Ability Scores
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ABILITY_KEYS.map((key) => {
                const a = computed.abilities[key];
                return (
                  <div key={key} className="rounded-lg border border-border bg-surface-raised p-2 text-center">
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      {ABILITY_LABELS[key]}
                    </div>
                    <div className="tnum text-lg font-semibold text-foreground">
                      {a?.effectiveScore ?? 10}
                    </div>
                    <div className="tnum text-xs text-gold">
                      {formatModifier(a?.modifier ?? 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top skills */}
      <Card className="mt-3">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Top Skills
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {topSkills.map((s) => (
              <div key={s.key} className="flex items-center justify-between border-b border-border/50 py-1">
                <span className="truncate text-sm text-foreground">{s.label}</span>
                <span className="tnum text-sm font-semibold text-rune">
                  {formatModifier(s.value)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        The full edit workspace, buff center, and shareable dashboard arrive in upcoming milestones.
      </p>
    </div>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "gold" | "rune" | "danger";
}) {
  const accentClass =
    accent === "gold" ? "text-gold" : accent === "rune" ? "text-rune" : accent === "danger" ? "text-danger" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </div>
        <div className={`tnum text-2xl font-semibold ${accentClass}`}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SaveBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tnum text-xl font-semibold text-foreground">{formatModifier(value)}</div>
    </div>
  );
}
