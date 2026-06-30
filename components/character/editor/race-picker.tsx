"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check, User } from "lucide-react";
import { applyRace, parseAbilityMods, type RaceApplyResult } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow, PickerDetail } from "./picker-shell";
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
    <PickerShell icon={<User />} title="Races" onClose={onClose}>
      {!selected ? (
        <>
          <PickerSearch autoFocus value={q} onChange={setQ} loading={loading} label="Search races" placeholder="Search races — e.g. Dwarves, Tiefling, Aasimar…" />
          <PickerError message={error} />
          <PickerList isEmpty={rows.length === 0 && !loading} hint={q.trim().length === 1 ? "Keep typing…" : "No races found."}>
            {rows.map((r) => (
              <PickerRow key={r.slug} onClick={() => select(r)} ariaLabel={`Select ${r.name}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                  {r.category && <Badge variant="gold">{r.category}</Badge>}
                </span>
              </PickerRow>
            ))}
          </PickerList>
        </>
      ) : (
        <PickerDetail title={selected.name} onBack={() => setSelected(null)}>
          <PickerError message={error} />
          {!trait ? (
            <p className="text-xs text-muted-foreground">Loading racial traits…</p>
          ) : (
            <>
              {/* Ability-mod tiles — big foreground number (WCAG-safe), sign carried by the border tint. */}
              {Object.keys(mods).length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {Object.entries(mods).map(([k, v]) => (
                    <div
                      key={k}
                      className={`flex flex-col items-center rounded-lg border bg-background py-1.5 ${v >= 0 ? "border-success/50" : "border-danger/50"}`}
                    >
                      <span className="text-sm font-bold tabular-nums text-foreground">
                        {v >= 0 ? "+" : ""}
                        {v}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{ABBR[k] ?? k}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {trait.size && <Badge variant="outline">{trait.size}</Badge>}
                {trait.speed && <Badge variant="outline">{trait.speed} ft speed</Badge>}
              </div>
              {Object.keys(mods).length === 0 && trait.ability_modifiers && (
                <p className="rounded border border-gold/40 bg-gold/10 px-2 py-1 text-[11px] text-foreground">
                  Flexible ability bonus — assign it yourself after applying.
                </p>
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
        </PickerDetail>
      )}
    </PickerShell>
  );
}
