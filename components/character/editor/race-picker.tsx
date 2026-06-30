"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X, Plus, Check } from "lucide-react";
import { applyRace, parseAbilityMods, type RaceApplyResult } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CharacterEditorApi } from "./use-character-editor";

type RaceRow = { slug: string; name: string; category: string | null };
type TraitRow = { ability_modifiers: string | null; size: string | null; speed: string | null; standard_traits: string | null };
type AltTrait = { slug: string; trait_name: string; replaces: string | null; description: string | null };

const ABBR: Record<string, string> = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

/**
 * Phase 7 — races. Search race_compendium, fetch its race_trait row (ability modifiers / size / speed /
 * standard traits), preview, and apply via applyRace (adds mods to the base score, sets size + speed, grants
 * the standard traits as a feature; re-applying reverts the prior race). Alternate racial traits are listed
 * (with what they replace) and added as features — the standard traits are prose, so a "replaces" is a note.
 */
export function RacePicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<RaceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RaceRow | null>(null);
  const [trait, setTrait] = useState<TraitRow | null>(null);
  const [alts, setAlts] = useState<AltTrait[]>([]);
  const [report, setReport] = useState<RaceApplyResult | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any).rpc("search_race_compendium", { p_query: term, p_limit: 30 });
      if (cancelled) return;
      setError(e?.message ?? null);
      setRows((data ?? []) as RaceRow[]);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, supabase]);

  const select = async (row: RaceRow) => {
    setSelected(row);
    setReport(null);
    setTrait(null);
    setAlts([]);
    setQ("");
    const [traitRes, altRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("race_trait_compendium").select("ability_modifiers,size,speed,standard_traits").eq("race", row.name).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("alternate_racial_trait_compendium").select("slug,trait_name,replaces,description").eq("race", row.name).order("trait_name").limit(100),
    ]);
    if (traitRes.error) {
      setError(traitRes.error.message);
      return;
    }
    setTrait((traitRes.data ?? null) as TraitRow | null);
    setAlts((altRes.data ?? []) as AltTrait[]);
  };

  const mods = useMemo(() => (trait ? parseAbilityMods(trait.ability_modifiers) : {}), [trait]);
  const addedAlts = useMemo(
    () => new Set(ed.draft.features.list.map((f) => f.compendiumId).filter(Boolean) as string[]),
    [ed.draft.features.list],
  );

  const apply = () => {
    if (!selected || !trait) return;
    const speed = parseInt(trait.speed ?? "", 10);
    let res: RaceApplyResult | undefined;
    ed.update((c) => {
      res = applyRace(c, {
        race: { name: selected.name, compendiumId: selected.slug },
        abilityMods: mods,
        size: trait.size ?? undefined,
        speed: Number.isFinite(speed) ? speed : undefined,
        standardTraits: trait.standard_traits ?? undefined,
      });
    });
    setReport(res ?? null);
  };

  const addAlt = (a: AltTrait) =>
    ed.update((c) => {
      if (c.features.list.some((f) => f.compendiumId === a.slug)) return;
      c.features.list.push({
        id: `alt_${a.slug}`,
        name: a.trait_name,
        category: "racial_trait",
        compendiumId: a.slug,
        description: [a.replaces ? `Replaces: ${a.replaces}` : "", (a.description ?? "").replace(/<br>/g, " ")].filter(Boolean).join(" — ") || undefined,
        automation: [],
      });
    });

  return (
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> Races
        </h4>
        <Button variant="ghost" size="icon" aria-label="Close races" onClick={onClose}>
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
              placeholder="Search races — e.g. Dwarves, Tiefling, Aasimar…"
              aria-label="Search races"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
            />
            {loading && <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {rows.length === 0 && !loading ? (
              <li className="px-1 py-2 text-sm text-muted-foreground">{q.trim().length === 1 ? "Keep typing…" : "No races found."}</li>
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
                    {r.category && <Badge variant="gold">{r.category}</Badge>}
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

          {!trait ? (
            <p className="text-xs text-muted-foreground">Loading racial traits…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {Object.entries(mods).map(([k, v]) => (
                  <Badge key={k} variant={v >= 0 ? "success" : "danger"}>
                    {v >= 0 ? "+" : ""}
                    {v} {ABBR[k] ?? k}
                  </Badge>
                ))}
                {trait.size && <Badge variant="outline">{trait.size}</Badge>}
                {trait.speed && <Badge variant="outline">{trait.speed} ft</Badge>}
              </div>
              {Object.keys(mods).length === 0 && trait.ability_modifiers && (
                <p className="text-[11px] text-warning">Flexible ability bonus — assign it yourself after applying.</p>
              )}

              <Button size="sm" onClick={apply}>
                Apply {selected.name}
              </Button>
              {report && (
                <p className="text-[11px] text-muted-foreground">
                  Applied {Object.keys(report.abilityMods).length} ability mod(s), size {report.size ?? "—"}, speed{" "}
                  {report.speed ?? "—"}.{report.reverted ? ` Reverted ${report.reverted}.` : ""}
                </p>
              )}

              {alts.length > 0 && (
                <div className="border-t border-border/60 pt-2">
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">Alternate racial traits</p>
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {alts.map((a) => {
                      const isAdded = addedAlts.has(a.slug);
                      return (
                        <li key={a.slug} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5">
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{a.trait_name}</span>
                            {a.replaces && <span className="truncate text-[11px] text-muted-foreground">replaces {a.replaces}</span>}
                          </div>
                          <Button size="sm" variant={isAdded ? "ghost" : "secondary"} disabled={isAdded} onClick={() => addAlt(a)} aria-label={`Add ${a.trait_name}`} className="shrink-0">
                            {isAdded ? (
                              <>
                                <Check className="size-4" /> Added
                              </>
                            ) : (
                              <>
                                <Plus className="size-4" /> Add
                              </>
                            )}
                          </Button>
                        </li>
                      );
                    })}
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
