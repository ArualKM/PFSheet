"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check, User } from "lucide-react";
import { applyRace, parseAbilityMods, type RaceApplyResult } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { enabledThreeppSystems } from "@/lib/character/threepp";
import { parseLandSpeed, type ThreeppRaceRow } from "@/lib/character/threepp-class-adapter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PickerShell,
  PickerSearch,
  PickerError,
  PickerList,
  PickerRow,
  PickerDetail,
  PickerDivider,
  ThreeppSystemBadge,
} from "./picker-shell";
import type { CharacterEditorApi } from "./use-character-editor";

type RaceRow = { slug: string; name: string; category: string | null };
type TraitRow = { ability_modifiers: string | null; size: string | null; speed: string | null; standard_traits: string | null };
type AltTrait = { slug: string; trait_name: string; replaces: string | null; description: string | null; system?: string | null };

const ABBR: Record<string, string> = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

/**
 * Phase 7 — races. Search race_compendium, fetch its race_trait row (ability modifiers / size / speed /
 * standard traits), preview, and apply via applyRace (adds mods to the base score, sets size + speed, grants
 * the standard traits as a feature; re-applying reverts the prior race). Alternate racial traits are listed
 * (with what they replace) and added as features — the standard traits are prose, so a "replaces" is a note.
 *
 * 3pp union (Phase 2b-B): with a 3pp module enabled, `threepp_race_compendium` rows for enabled systems (the
 * 20 akashic races) list under a "Third-party" divider. A 3pp row already carries its ability modifiers / size
 * / speed / traits, so selection is synchronous (no trait-row fetch) and apply reuses the same applyRace path
 * — `parseAbilityMods` handles the dataset's full ability names ("+2 Dexterity, -2 Intelligence").
 */
const RACE_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

export function RacePicker({
  ed,
  onClose,
  initialQuery,
}: {
  ed: CharacterEditorApi;
  onClose: () => void;
  initialQuery?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState(initialQuery ?? "");
  const [rows, setRows] = useState<RaceRow[]>([]);
  const [tppRows, setTppRows] = useState<ThreeppRaceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RaceRow | null>(null);
  const [trait, setTrait] = useState<TraitRow | null>(null);
  const [alts, setAlts] = useState<AltTrait[]>([]);
  const [report, setReport] = useState<RaceApplyResult | null>(null);

  // 3pp gating (docs/3PP_MASTER_PLAN.md D1) — string-keyed so the effect re-fires only on a module toggle.
  const threeppKey = useMemo(() => enabledThreeppSystems(ed.draft).join(","), [ed.draft]);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const systems = threeppKey ? threeppKey.split(",") : [];
    const t = setTimeout(async () => {
      setLoading(true);
      // Gate BEFORE querying: with no enabled 3pp module, the union query never fires.
      const [core, tp] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("search_race_compendium", { p_query: term, p_limit: 30 }),
        systems.length > 0
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).rpc("search_threepp_race_compendium", { p_query: term, p_limit: 60 })
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setError(core.error?.message ?? null);
      setRows((core.data ?? []) as RaceRow[]);
      // The 3pp union fails soft; only enabled systems surface (today all 20 rows are akashic).
      const tpRows = tp && !tp.error ? ((tp.data ?? []) as ThreeppRaceRow[]) : [];
      setTppRows(tpRows.filter((r) => !!r.system && systems.includes(r.system)));
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, supabase, threeppKey]);

  const select = async (row: RaceRow) => {
    setSelected(row);
    setReport(null);
    setTrait(null);
    setAlts([]);
    setQ("");
    // 3pp union (Phase 7): with a 3pp module enabled, threepp_racial_trait_compendium alt-traits keyed to this
    // CORE race name (all spheres today, e.g. Elf → 11) merge into the same alt-trait list, fail-soft. Gated
    // BEFORE querying — with no enabled module the union never fires.
    const systems = threeppKey ? threeppKey.split(",") : [];
    // race_compendium.name (row.name) is PLURAL ("Elves", "Dwarves", "Half-Elves"), but
    // threepp_racial_trait_compendium.race keys to the SINGULAR form ("Elf", "Dwarf", "Half-Elf") —
    // irregular ("ves"→"f"), so match both the plural and its singularization.
    const raceCandidates = Array.from(new Set([row.name, row.name.replace(/ves$/i, "f").replace(/s$/i, "")]));
    const [traitRes, altRes, tppAltRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("race_trait_compendium").select("ability_modifiers,size,speed,standard_traits").eq("race", row.name).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("alternate_racial_trait_compendium").select("slug,trait_name,replaces,description").eq("race", row.name).order("trait_name").limit(100),
      systems.length > 0
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("threepp_racial_trait_compendium")
            .select("slug,name,replaces,description,system")
            .in("race", raceCandidates)
            .in("system", systems)
            .order("name")
            .limit(100)
        : Promise.resolve(null),
    ]);
    if (traitRes.error) {
      setError(traitRes.error.message);
      return;
    }
    setTrait((traitRes.data ?? null) as TraitRow | null);
    const coreAlts = (altRes.data ?? []) as AltTrait[];
    // The 3pp union fails soft; only enabled systems surface. 3pp rows carry `name` (→ trait_name), a `3pp:`
    // slug (compendiumId namespace), and their system (drives the source badge).
    const tppAlts =
      tppAltRes && !tppAltRes.error
        ? ((tppAltRes.data ?? []) as { slug: string; name: string; replaces: string | null; description: string | null; system: string | null }[])
            .filter((a) => !!a.system && systems.includes(a.system))
            .map((a) => ({ slug: `3pp:${a.slug}`, trait_name: a.name, replaces: a.replaces, description: a.description, system: a.system }))
        : [];
    setAlts([...coreAlts, ...tppAlts]);
  };

  /** 3pp selection is fully synchronous — the row already carries mods/size/speed/traits, so it maps straight
   * onto the TraitRow the detail + apply path consume ("30 feet (land); 20 feet (climb)" → land 30). The
   * `3pp:`-prefixed slug keeps `identity.raceApplied` revert + compendiumId clear of core slugs. The 3pp race
   * table (akashic) has no alt-trait rows, so `alts` stays empty here; the 3pp alt-traits (all spheres, keyed
   * to CORE race names like "Elf") surface in the core-race `select()` path when a 3pp module is enabled. */
  const selectTpp = (row: ThreeppRaceRow) => {
    setSelected({ slug: `3pp:${row.slug}`, name: row.name ?? row.slug, category: null });
    setReport(null);
    setAlts([]);
    setQ("");
    setError(null);
    const speed = parseLandSpeed(row.speed);
    setTrait({
      ability_modifiers: row.ability_modifiers,
      size: row.size,
      speed: speed != null ? String(speed) : null,
      standard_traits: row.racial_traits,
    });
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
      // Capture the previously-applied race mods BEFORE applyRace overwrites raceApplied — needed
      // to mirror the NET racial change into Point Buy below.
      const prior = (c.identity.raceApplied?.abilityMods ?? {}) as Record<string, number>;
      const pb = c.abilities.pointBuy;
      res = applyRace(c, {
        race: { name: selected.name, compendiumId: selected.slug },
        abilityMods: mods,
        size: trait.size ?? undefined,
        speed: Number.isFinite(speed) ? speed : undefined,
        standardTraits: trait.standard_traits ?? undefined,
      });
      // Point Buy recomposes each score as allocation + pointBuy.racial on every Apply, which
      // would erase applyRace's score delta (the reported "race doesn't stick under point buy"
      // bug). Mirror the NET racial change (new − prior) into pointBuy.racial — by delta, so a
      // manually-entered "racial/other" value in that field is preserved — so the next recompose
      // reproduces exactly the score applyRace just set. No-op when Point Buy is off.
      if (pb?.enabled) {
        for (const key of RACE_ABILITY_KEYS) {
          const delta = (mods[key] ?? 0) - (prior[key] ?? 0);
          if (delta !== 0) pb.racial[key] = (pb.racial[key] ?? 0) + delta;
        }
      }
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
          <PickerList
            isEmpty={rows.length === 0 && tppRows.length === 0 && !loading}
            hint={q.trim().length === 1 ? "Keep typing…" : "No races found."}
          >
            {rows.map((r) => (
              <PickerRow key={r.slug} onClick={() => select(r)} ariaLabel={`Select ${r.name}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                  {r.category && <Badge variant="gold">{r.category}</Badge>}
                </span>
              </PickerRow>
            ))}
            {tppRows.length > 0 && (
              <>
                <PickerDivider label="Third-party" />
                {tppRows.map((r) => (
                  <PickerRow key={`3pp-${r.slug}`} onClick={() => selectTpp(r)} ariaLabel={`Select ${r.name ?? r.slug} (third-party)`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{r.name ?? r.slug}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {r.size && <Badge variant="outline">{r.size}</Badge>}
                        <ThreeppSystemBadge system={r.system} />
                      </span>
                    </span>
                  </PickerRow>
                ))}
              </>
            )}
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
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-foreground">{a.trait_name}</span>
                              {a.system && <ThreeppSystemBadge system={a.system} />}
                            </span>
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
