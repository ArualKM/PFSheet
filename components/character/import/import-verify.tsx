"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search, X, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ImportClaim, ImportQuestion, ClaimResolution, ClaimKind } from "@/lib/character/import-claims";
import { KIND_TABLES, pickClassCandidate } from "@/lib/character/import-claims";
import type { ClaimAnswers } from "@/lib/character/import-apply";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The import Verify step (docs/IMPORT_VERIFICATION_PLAN.md): every assertion the import makes is a
 * claim the player confirms, corrects (candidate radio or a search box against the right
 * compendium), keeps as written, or skips. Clarifying questions (gestalt / mythic / core-vs-
 * unchained) sit on top — the unchained toggle re-picks its class claim's candidate live.
 * Controlled: the wizard owns the ClaimAnswers and sends them to commit.
 */

const KIND_LABEL: Record<ClaimKind, string> = {
  class: "Classes",
  archetype: "Archetypes",
  race: "Race",
  feat: "Feats & abilities",
  feature: "Class features",
  sphere_talent: "Sphere talents",
  psionic_power: "Psionic powers",
  pow_maneuver: "Maneuvers & stances",
  mythic_ability: "Mythic abilities",
  racial_trait: "Racial traits",
  trait: "Traits",
  drawback: "Drawbacks",
  spell: "Spells & talents",
};

const KIND_ORDER: ClaimKind[] = [
  "class",
  "archetype",
  "race",
  "racial_trait",
  "feat",
  "feature",
  "sphere_talent",
  "psionic_power",
  "pow_maneuver",
  "mythic_ability",
  "trait",
  "drawback",
  "spell",
];

/** The search RPC for a claim's primary table (spells + sphere talents search by ilike — their
 * RPCs have different signatures). */
const SEARCH_RPC: Record<string, string | undefined> = {
  class_compendium: "search_class_compendium",
  archetype_compendium: "search_archetype_compendium",
  race_compendium: "search_race_compendium",
  feat_compendium: "search_feat_compendium",
  trait_compendium: "search_trait_compendium",
  drawback_compendium: "search_drawback_compendium",
  class_feature_compendium: "search_class_feature_compendium",
  psionic_power_compendium: "search_psionic_power_compendium",
  pow_maneuver_compendium: "search_pow_maneuver_compendium",
  mythic_path_ability_compendium: "search_mythic_path_ability_compendium",
  alternate_racial_trait_compendium: "search_alternate_racial_trait_compendium",
};

/** Fallback ilike config for tables without a usable search RPC. */
const ILIKE_TABLES: Record<string, { select: string; label: string }> = {
  spell_compendium: { select: "id,name", label: "name" },
  sphere_talents: { select: "id,talent_name", label: "talent_name" },
};

/** A linked class claim whose level is still unknown (0) — the wizard blocks commit on these so a
 * "Fighter / Wizard" line can't silently import as Fighter 1 / Wizard 1. */
export function importNeedsLevels(claims: ImportClaim[], answers: ClaimAnswers): boolean {
  return claims.some((c) => {
    if (c.sourceKind !== "class") return false;
    const res = answers.resolutions?.[c.id] ?? c.resolution;
    if (res.mode !== "linked") return false;
    const lvl = answers.classLevels?.[c.id] ?? c.level ?? 0;
    return !(Number.isFinite(lvl) && lvl >= 1);
  });
}

export function ImportVerifyPanel({
  claims,
  questions,
  notices = [],
  answers,
  onAnswers,
}: {
  claims: ImportClaim[];
  questions: ImportQuestion[];
  notices?: string[];
  answers: ClaimAnswers;
  onAnswers: (next: ClaimAnswers) => void;
}) {
  const effective = (c: ImportClaim): ClaimResolution => answers.resolutions?.[c.id] ?? c.resolution;
  const setResolution = (id: string, res: ClaimResolution) =>
    onAnswers({ ...answers, resolutions: { ...(answers.resolutions ?? {}), [id]: res } });
  const setQuestion = (id: string, v: boolean) => {
    const q = questions.find((x) => x.id === id);
    const next: ClaimAnswers = { ...answers, questions: { ...(answers.questions ?? {}), [id]: v } };
    // The core-vs-Unchained toggle STEERS its class claim: re-pick the candidate matching the
    // answer (a later hand-pick in the row still wins — it overwrites this resolution).
    if (q?.kind === "unchained") {
      const res = { ...(next.resolutions ?? {}) };
      for (const c of claims) {
        if (c.kind !== "class" || c.unchainedQuestionId !== id) continue;
        const pick = pickClassCandidate(c.candidates, v);
        if (pick) res[c.id] = { mode: "linked", table: pick.table, slug: pick.slug, name: pick.name };
      }
      next.resolutions = res;
    }
    onAnswers(next);
  };
  const setLevel = (id: string, v: number) =>
    onAnswers({ ...answers, classLevels: { ...(answers.classLevels ?? {}), [id]: v } });

  const counts = useMemo(() => {
    let linked = 0;
    let generic = 0;
    let skipped = 0;
    for (const c of claims) {
      const m = effective(c).mode;
      if (m === "linked") linked++;
      else if (m === "generic") generic++;
      else skipped++;
    }
    return { linked, generic, skipped };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, answers]);

  const groups = useMemo(() => {
    const map = new Map<ClaimKind, ImportClaim[]>();
    for (const kind of KIND_ORDER) map.set(kind, []);
    for (const c of claims) (map.get(c.kind) ?? map.get(c.sourceKind))!.push(c);
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [claims]);

  const keepEverything = () => {
    const res: Record<string, ClaimResolution> = {};
    for (const c of claims) res[c.id] = { mode: c.mined ? "skipped" : "generic" };
    onAnswers({ ...answers, resolutions: res });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-gold" /> Verify &amp; link
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tnum">
            {counts.linked} linked · {counts.generic} as written · {counts.skipped} skipped
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={keepEverything}>
            Keep everything as written
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Everything the import found is listed below with its proposed compendium match. Green = an
          exact match that will auto-fill mechanics; amber = several possible matches, pick the right
          one. Open any row to choose a different entry, search the compendium, keep the original
          text, or skip it. Nothing is discarded — skipped and unmatched text stays in your imported
          notes.
        </p>

        {notices.map((n, i) => (
          <p key={`n-${i}`} className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {n}
          </p>
        ))}

        {questions.length > 0 && (
          <div className="space-y-2 rounded-lg border border-gold/40 bg-gold/5 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quick questions
            </span>
            {questions.map((q) => {
              const val = answers.questions?.[q.id] ?? q.defaultAnswer;
              const labels: [string, string] =
                q.kind === "unchained" ? ["Unchained", "Core"] : ["Yes", "No"];
              return (
                <div key={q.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-sm text-foreground">{q.text}</span>
                  <div role="group" aria-label={q.text} className="inline-flex rounded-lg border border-border bg-background p-0.5">
                    {[true, false].map((v, i) => (
                      <button
                        key={String(v)}
                        type="button"
                        aria-pressed={val === v}
                        onClick={() => setQuestion(q.id, v)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          val === v ? "bg-gold/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {labels[i]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {groups.map(([kind, list]) => (
          <section key={kind}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {KIND_LABEL[kind]}
              {list.every((c) => c.mined) ? " — mined from your text" : ""}
              <span className="ml-1.5 normal-case text-muted-foreground/70">({list.length})</span>
            </h3>
            <div className="space-y-1">
              {list.map((c) => (
                <ClaimRow
                  key={c.id}
                  claim={c}
                  resolution={effective(c)}
                  level={answers.classLevels?.[c.id] ?? c.level}
                  onResolution={(res) => setResolution(c.id, res)}
                  onLevel={(v) => setLevel(c.id, v)}
                />
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function ClaimRow({
  claim,
  resolution,
  level,
  onResolution,
  onLevel,
}: {
  claim: ImportClaim;
  resolution: ClaimResolution;
  level?: number;
  onResolution: (res: ClaimResolution) => void;
  onLevel: (v: number) => void;
}) {
  const isClass = claim.sourceKind === "class";
  const needsLevel = isClass && resolution.mode === "linked" && !((level ?? 0) >= 1);
  // A class claim without a level (or an ambiguous multi-match) needs attention — start open.
  const [open, setOpen] = useState(needsLevel || Boolean(claim.ambiguous));
  const linked = resolution.mode === "linked";
  const chosen = linked
    ? claim.candidates.find((c) => c.table === resolution.table && c.slug === resolution.slug) ?? {
        name: resolution.name ?? "custom pick",
        table: resolution.table,
        slug: resolution.slug,
        match: "search" as const,
      }
    : null;

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full min-w-0 flex-wrap items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={claim.sourceText}>
          {claim.sourceText}
          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {claim.sourceLabel}
          </span>
        </span>
        {needsLevel && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px] text-foreground">
            <AlertTriangle className="size-3 text-warning" /> set level
          </span>
        )}
        {linked && chosen ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/50 bg-success/10 px-2 py-0.5 text-[11px] text-foreground">
            <Check className="size-3 text-success" /> {chosen.name}
          </span>
        ) : resolution.mode === "generic" && claim.ambiguous ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px] text-foreground">
            <AlertTriangle className="size-3 text-warning" /> {claim.candidates.filter((c) => c.match === "exact").length} matches — pick one
          </span>
        ) : resolution.mode === "generic" ? (
          <span className="shrink-0 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[11px] text-muted-foreground">
            as written
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground/70 line-through">
            skipped
          </span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/50 p-2.5">
          {isClass && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Level
              <input
                type="number"
                min={1}
                max={20}
                value={level && level >= 1 ? level : ""}
                placeholder="?"
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  onLevel(Number.isFinite(n) && n >= 1 ? Math.min(20, n) : 0);
                }}
                className={cn(
                  "tnum h-9 w-16 rounded-md border bg-background px-2 text-sm text-foreground",
                  needsLevel ? "border-warning" : "border-border",
                )}
              />
              {needsLevel && <span className="text-warning">required before import</span>}
            </label>
          )}

          {claim.candidates.length > 0 && (
            <div className="space-y-1">
              {claim.candidates.map((cand) => (
                <label key={`${cand.table}:${cand.slug}`} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    checked={linked && resolution.table === cand.table && resolution.slug === cand.slug}
                    onChange={() => onResolution({ mode: "linked", table: cand.table, slug: cand.slug, name: cand.name })}
                    className="mt-1 accent-gold"
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{cand.name}</span>
                    {cand.match === "exact" && (
                      <span className="ml-1.5 rounded bg-success/10 px-1 py-0.5 text-[10px] text-success">exact</span>
                    )}
                    {cand.table !== KIND_TABLES[claim.sourceKind][0] && (
                      <span className="ml-1.5 rounded bg-gold/10 px-1 py-0.5 text-[10px] text-gold">
                        re-files as {KIND_LABEL[(Object.entries(KIND_TABLES).find(([, t]) => t[0] === cand.table)?.[0] as ClaimKind) ?? claim.kind]?.toLowerCase() ?? cand.table}
                      </span>
                    )}
                    {cand.meta && <span className="block truncate text-[11px] text-muted-foreground">{cand.meta}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}

          <ClaimSearch claim={claim} onPick={(table, slug, name) => onResolution({ mode: "linked", table, slug, name })} />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={resolution.mode === "generic" ? "secondary" : "ghost"}
              onClick={() => onResolution({ mode: "generic" })}
            >
              Keep as written
            </Button>
            {/* No Skip for classes — dropping class levels is never what Skip means; use
                "Keep as written" and edit afterward instead. */}
            {!isClass && (
              <Button
                type="button"
                size="sm"
                variant={resolution.mode === "skipped" ? "secondary" : "ghost"}
                onClick={() => onResolution({ mode: "skipped" })}
              >
                <X className="size-3.5" /> {claim.partOf ? "Skip item" : claim.mined ? "Leave in notes" : "Skip"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Search-to-correct: a debounced search of the claim's current-kind compendium table. */
function ClaimSearch({
  claim,
  onPick,
}: {
  claim: ImportClaim;
  onPick: (table: string, slug: string, name: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const table = KIND_TABLES[claim.kind][0]!;
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (term.length < 2) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const rpc = SEARCH_RPC[table];
        let data: Record<string, unknown>[] = [];
        if (rpc) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (supabase as any).rpc(rpc, { p_query: term, p_limit: 6 });
          data = (res.data ?? []) as Record<string, unknown>[];
        } else {
          const cfg = ILIKE_TABLES[table] ?? { select: "id,name", label: "name" };
          const esc = term.replace(/([%_\\])/g, "\\$1");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (supabase as any).from(table).select(cfg.select).ilike(cfg.label, `%${esc}%`).limit(6);
          data = (res.data ?? []) as Record<string, unknown>[];
        }
        if (!cancelled) {
          setRows(
            data.map((r) => ({
              slug: String(r.slug ?? r.id ?? ""),
              name: String(r.name ?? r.feature ?? r.talent_name ?? r.trait_name ?? ""),
            })),
          );
        }
      } catch {
        if (!cancelled) setRows([]);
      }
      if (!cancelled) setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, supabase, table]);

  return (
    <div className="text-xs">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search the ${KIND_LABEL[claim.kind].toLowerCase()} compendium…`}
          aria-label={`Search a match for ${claim.sourceText}`}
          className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-2 text-sm text-foreground sm:max-w-sm"
        />
        {loading && <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {rows.length > 0 && (
        <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-border bg-surface sm:max-w-sm">
          {rows.map((r) => (
            <li key={r.slug}>
              <button
                type="button"
                onClick={() => {
                  onPick(table, r.slug, r.name);
                  setQ("");
                  setRows([]);
                }}
                className="block w-full px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-surface-raised"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
