"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X } from "lucide-react";
import { parseProgression, type CompendiumClassInput, type HpMethod } from "@pathforge/schema";
import { applyCompendiumClass, type ApplyCompendiumClassResult } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { parseHitDie } from "@/lib/character/class-compendium";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";

type PrestigeRow = { slug: string; name: string; hit_die: string | null; role: string | null; description: string | null };

const HP_METHODS: HpMethod[] = ["manual", "average", "max"];
const HP_LABELS: Record<HpMethod, string> = { manual: "Manual", average: "Average", max: "Max" };

/**
 * Phase 6 — prestige classes. A prestige class is a compendium class (its own BAB/saves/HP progression) that
 * is applied via the SAME builder (applyCompendiumClass), with two prestige-specific twists driven by the
 * data: (1) its spellcasting is "+N level of existing class", so we suppress the spurious new-caster the
 * progression's spell columns would otherwise create (the player advances their existing caster manually);
 * (2) the dataset has no normalized requirements, so we show the description for self-assessed eligibility
 * rather than auto-gating. No feature table exists for prestige classes (features are noted in the prose).
 */
export function PrestigePicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PrestigeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PrestigeRow | null>(null);
  const [progression, setProgression] = useState<unknown>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseProgression> | null>(null);
  const [level, setLevel] = useState(1);
  const [hpMethod, setHpMethod] = useState<HpMethod>("average");
  const [report, setReport] = useState<ApplyCompendiumClassResult | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any).rpc("search_prestige_class_compendium", { p_query: term, p_limit: 30 });
      if (cancelled) return;
      setError(e?.message ?? null);
      setRows((data ?? []) as PrestigeRow[]);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, supabase]);

  const select = async (row: PrestigeRow) => {
    setSelected(row);
    setReport(null);
    setParsed(null);
    setProgression(null);
    setQ("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (supabase as any).from("prestige_progression").select("json_data").eq("class", row.name).maybeSingle();
    if (e) {
      setError(e.message);
      return;
    }
    const prog = data?.json_data ?? null;
    setProgression(prog);
    const p = parseProgression(prog);
    if (!prog) p.warnings.push("No progression data for this prestige class — BAB/saves default to ¾/poor.");
    setParsed(p);
  };

  const apply = () => {
    if (!selected || !progression) return;
    const input: CompendiumClassInput = {
      key: `pfcore-prestige:${selected.slug}`,
      name: selected.name,
      hitDie: parseHitDie(selected.hit_die),
      skillRanksPerLevel: 2,
      classSkillKeys: [],
      progression,
    };
    let res: ApplyCompendiumClassResult | undefined;
    ed.update((c) => {
      res = applyCompendiumClass(c, { input, level, hpMethod, suppressCaster: true });
    });
    setReport(res ?? null);
  };

  return (
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> Prestige classes
        </h4>
        <Button variant="ghost" size="icon" aria-label="Close prestige classes" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      {!selected ? (
        <>
          <div className="relative">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search prestige classes — e.g. Arcane Trickster, Duelist…"
              aria-label="Search prestige classes"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
            />
            {loading && (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {rows.length === 0 && !loading ? (
              <li className="px-1 py-2 text-sm text-muted-foreground">
                {q.trim().length === 1 ? "Keep typing…" : "No prestige classes found."}
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
                    {r.hit_die && <Badge variant="gold">d{parseHitDie(r.hit_die)}</Badge>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      ) : (
        <div className="space-y-3 rounded-md border border-border/70 p-3">
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
              </div>

              {parsed.caster && (
                <p className="rounded border border-rune/30 bg-rune/5 p-2 text-[11px] text-muted-foreground">
                  This prestige class advances an existing caster level — applied as BAB/saves/HP only; raise your
                  caster&apos;s level by your prestige levels manually.
                </p>
              )}

              {selected.description && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer text-foreground">Requirements &amp; description</summary>
                  <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {selected.description.replace(/<br>/g, "\n")}
                  </p>
                </details>
              )}
              <p className="text-[11px] text-warning">Check you meet the entry requirements — they aren&apos;t auto-verified.</p>

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

              <Button size="sm" disabled={!progression} onClick={apply}>
                Apply {selected.name} {level}
              </Button>

              {report && (
                <div className="rounded bg-surface-sunken p-2 text-[11px] text-muted-foreground">
                  <ul className="ml-4 list-disc">
                    {report.wrote.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
