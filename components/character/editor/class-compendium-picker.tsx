"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X } from "lucide-react";
import {
  parseProgression,
  ABILITY_KEYS,
  type AbilityKey,
  type CasterType,
  type HpMethod,
} from "@pathforge/schema";
import { applyCompendiumClass, type ApplyCompendiumClassResult } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { buildClassInput, buildFeatureRows, casterDefaults, parseHitDie, type ClassCompendiumRow } from "@/lib/character/class-compendium";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";

const HP_METHODS: HpMethod[] = ["manual", "average", "max"];
const HP_LABELS: Record<HpMethod, string> = { manual: "Manual", average: "Average", max: "Max" };
const CASTER_TYPES: CasterType[] = ["prepared", "spontaneous", "spellbook"];

/**
 * Phase 4 — the progression-driven class builder UI. Searches `class_compendium`, parses the selected class's
 * `class_progression` to preview BAB/saves/caster, then applies it via applyCompendiumClass (which reuses the
 * existing class math via a cached synthetic preset + grants each level's `class_features`). The casting
 * ability / caster type aren't in the dataset, so the player confirms them (defaulted from a matching core class).
 */
export function ClassCompendiumPicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ClassCompendiumRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ClassCompendiumRow | null>(null);
  const [progression, setProgression] = useState<unknown>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseProgression> | null>(null);
  const [level, setLevel] = useState(1);
  const [hpMethod, setHpMethod] = useState<HpMethod>("average");
  const [castingAbility, setCastingAbility] = useState<AbilityKey>("int");
  const [casterType, setCasterType] = useState<CasterType>("prepared");
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<ApplyCompendiumClassResult | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any).rpc("search_class_compendium", { p_query: term, p_limit: 30 });
      if (cancelled) return;
      setError(e?.message ?? null);
      setRows((data ?? []) as ClassCompendiumRow[]);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, supabase]);

  const select = async (row: ClassCompendiumRow) => {
    setSelected(row);
    setReport(null);
    setParsed(null);
    setProgression(null);
    setQ("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (supabase as any).from("class_progression").select("json_data").eq("class", row.name).maybeSingle();
    if (e) {
      setError(e.message);
      return;
    }
    const prog = data?.json_data ?? null;
    setProgression(prog);
    const p = parseProgression(prog);
    if (!prog) p.warnings.push("No progression data for this class in the compendium — BAB/saves default to ¾/poor.");
    setParsed(p);
    const def = casterDefaults(row.name);
    setCastingAbility(def.castingAbility);
    setCasterType(def.casterType);
  };

  const apply = async () => {
    if (!selected || !progression) return;
    setApplying(true);
    const [featRes, fxRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("class_feature_compendium").select("slug,feature,level,type,description").eq("class", selected.name).eq("category", "Main"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("feature_effect").select("feature,target,op,value_or_formula,bonus_type,notes").eq("class", selected.name),
    ]);
    if (featRes.error || fxRes.error) {
      setError(featRes.error?.message ?? fxRes.error?.message ?? "Could not load class features");
      setApplying(false);
      return;
    }
    // input always carries castingAbility/casterType; compendiumRowToPreset only uses them when
    // parseProgression detects a caster, so a martial class simply ignores them.
    const input = buildClassInput(selected, progression, { castingAbility, casterType });
    const featureRows = buildFeatureRows(featRes.data ?? [], fxRes.data ?? []);
    let res: ApplyCompendiumClassResult | undefined;
    ed.update((c) => {
      res = applyCompendiumClass(c, { input, level, hpMethod, features: featureRows });
    });
    setReport(res ?? null);
    setApplying(false);
  };

  return (
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> Class compendium
        </h4>
        <Button variant="ghost" size="icon" aria-label="Close class compendium" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="relative">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search classes — e.g. Fighter, Oracle, Magus…"
          aria-label="Search the class compendium"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
        />
        {loading && (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {!selected && (
        <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {rows.length === 0 && !loading ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {q.trim().length === 1 ? "Keep typing…" : "No classes found."}
            </li>
          ) : (
            rows.map((r) => (
              <li key={r.slug}>
                <button
                  type="button"
                  onClick={() => select(r)}
                  aria-label={`Select ${r.name}`}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left hover:border-rune/50"
                >
                  <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {r.hit_die && <Badge variant="gold">d{parseHitDie(r.hit_die)}</Badge>}
                    {r.role && <span className="text-[11px] text-muted-foreground">{r.role.split(/[.,]/)[0]}</span>}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {selected && (
        <div className="mt-3 space-y-3 rounded-md border border-border/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{selected.name}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              ← Back
            </Button>
          </div>

          {!parsed ? (
            <p className="text-xs text-muted-foreground">Loading progression…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="gold">d{parseHitDie(selected.hit_die)}</Badge>
                <Badge variant="outline">BAB {parsed.bab.replace("_", "-")}</Badge>
                <Badge variant="outline">Fort {parsed.saves.fortitude}</Badge>
                <Badge variant="outline">Ref {parsed.saves.reflex}</Badge>
                <Badge variant="outline">Will {parsed.saves.will}</Badge>
                {parsed.caster && <Badge variant="rune">caster (CL {parsed.caster.clProgression.replace("_", "-")})</Badge>}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <NumberField label="Level" value={level} min={1} onChange={(v) => setLevel(Math.max(1, v))} />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Hit points</span>
                  <div className="flex gap-1.5" role="group" aria-label="Hit point method">
                    {HP_METHODS.map((m) => (
                      <Button key={m} size="sm" variant={hpMethod === m ? "default" : "outline"} aria-pressed={hpMethod === m} onClick={() => setHpMethod(m)}>
                        {HP_LABELS[m]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {parsed.caster && (
                <div className="flex flex-wrap items-end gap-3 rounded border border-rune/30 bg-rune/5 p-2">
                  <label className="text-xs">
                    <span className="mb-1 block font-medium text-muted-foreground">Casting ability</span>
                    <select
                      value={castingAbility}
                      onChange={(e) => setCastingAbility(e.target.value as AbilityKey)}
                      aria-label="Casting ability"
                      className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                    >
                      {ABILITY_KEYS.map((a) => (
                        <option key={a} value={a}>
                          {a.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block font-medium text-muted-foreground">Caster type</span>
                    <select
                      value={casterType}
                      onChange={(e) => setCasterType(e.target.value as CasterType)}
                      aria-label="Caster type"
                      className="h-9 rounded-lg border border-border bg-background px-2 text-sm capitalize text-foreground"
                    >
                      {CASTER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="w-full text-[11px] text-muted-foreground">
                    The dataset doesn&apos;t record the casting stat — confirm it (the default is often wrong for
                    non-core classes).
                  </p>
                </div>
              )}

              {parsed.warnings.length > 0 && (
                <ul className="ml-4 list-disc text-[11px] text-warning">
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}

              <Button size="sm" disabled={applying || !progression} onClick={apply}>
                {applying ? <Loader2 className="size-4 animate-spin" /> : null}
                Apply {selected.name} {level}
              </Button>

              {report && (
                <div className="rounded bg-surface-sunken p-2 text-[11px]">
                  <span className="font-medium text-foreground">Applied:</span>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {report.wrote.map((w, i) => (
                      <li key={`w${i}`}>{w}</li>
                    ))}
                    {report.featuresAdded.length > 0 && <li>Granted {report.featuresAdded.length} class features</li>}
                  </ul>
                  {report.warnings.length > 0 && (
                    <ul className="ml-4 mt-1 list-disc text-warning">
                      {report.warnings.map((w, i) => (
                        <li key={`warn${i}`}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
