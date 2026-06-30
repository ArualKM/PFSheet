"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, X, Loader2 } from "lucide-react";
import { applySystemTradition, systemTradition, type SphereSystem } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Mode = "talents" | "spheres" | "traditions" | "drawbacks" | "boons";

type TalentResult = {
  id: string;
  sphere_name: string;
  talent_name: string;
  talent_category: string | null;
  subcategory: string | null;
  base_cost: string | null;
  prerequisites: string | null;
  source: string | null;
  description: string | null;
};
type SphereResult = { id: string; name: string; system: string };
type TraditionResult = {
  id: string;
  name: string;
  type: string | null;
  drawbacks_gained: string | null;
  boons_gained: string | null;
  description: string | null;
};
type DrawbackResult = { id: string; name: string; sphere: string | null; system: string | null; tradition: string | null; description: string | null };
type BoonResult = { id: string; name: string; system: string | null; tradition: string | null; description: string | null };

const CATEGORIES = ["Base Talent", "Advanced Talent", "Legendary Talent"];
const SYSTEMS = ["Magic", "Combat", "Skill"] as const;
const MODES: Mode[] = ["talents", "spheres", "traditions", "drawbacks", "boons"];

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Split a prose grant field (drawbacks_gained / boons_gained) into trimmed lines for the lists. */
function grantLines(raw: string | null): string[] {
  return (raw ?? "")
    .split(/<br>|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Client-side hierarchical ranking by name: exact → starts-with → contains; drops non-matches.
 * Used for the small sphere (68) + tradition (225) sets; talents use the ranked server RPC. */
function rankByName<T extends { name: string }>(items: T[], term: string): T[] {
  const q = term.trim().toLowerCase();
  if (!q) return items;
  const tier = (n: string): number => {
    const l = n.toLowerCase();
    return l === q ? 0 : l.startsWith(q) ? 1 : l.includes(q) ? 2 : 99;
  };
  return items
    .map((i) => ({ i, t: tier(i.name) }))
    .filter((x) => x.t < 99)
    .sort((a, b) => a.t - b.t || a.i.name.localeCompare(b.i.name))
    .map((x) => x.i);
}

/**
 * Compendium picker for the Spheres editor — searches sphere_talents / sphere_compendium /
 * sphere_traditions directly (public-read) and adds picks to character.spheres. Single-column results
 * so the long names stay readable in the editor's panel width (mobile + desktop alike). Picking a
 * tradition sets it and applies its granted drawbacks/boons as editable entries.
 */
export type SpherePickerMode = Mode;

export function SpherePicker({
  ed,
  onClose,
  mode,
  onModeChange,
  system,
}: {
  ed: CharacterEditorApi;
  onClose: () => void;
  /** Controlled by the parent so a different "Add"/"Browse" entry point can retarget the tab
   * without remounting the picker (which would refetch the reference tables + drop the search). */
  mode: SpherePickerMode;
  onModeChange: (mode: SpherePickerMode) => void;
  /** When set, scopes the spheres/talents/drawbacks/boons results to one Spheres system
   * (Magic/Combat/Skill). Traditions have no system in the data, so they stay unscoped. */
  system?: SphereSystem;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [sphere, setSphere] = useState("");
  const [category, setCategory] = useState("");
  const [allSpheres, setAllSpheres] = useState<SphereResult[]>([]);
  const [allTraditions, setAllTraditions] = useState<TraditionResult[]>([]);
  const [allDrawbacks, setAllDrawbacks] = useState<DrawbackResult[]>([]);
  const [allBoons, setAllBoons] = useState<BoonResult[]>([]);
  const [talents, setTalents] = useState<TalentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refLoading, setRefLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Spheres (68) + traditions (225) + drawbacks (489) + boons (29) are small — load once, rank client-side.
  // refLoading starts true (useState) and flips false after the fetch; the component remounts fresh on
  // each open, so no synchronous re-arm is needed here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sphereRes, tradRes, drawRes, boonRes] = await Promise.all([
        supabase.from("sphere_compendium").select("id,name,system").order("name", { ascending: true }),
        supabase
          .from("sphere_traditions")
          .select("id,name,type,drawbacks_gained,boons_gained,description")
          .order("name", { ascending: true }),
        supabase
          .from("sphere_drawbacks")
          .select("id,name,sphere,system,tradition,description")
          .order("name", { ascending: true }),
        supabase
          .from("sphere_boons")
          .select("id,name,system,tradition,description")
          .order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      if (sphereRes.data) setAllSpheres(sphereRes.data as SphereResult[]);
      if (tradRes.data) setAllTraditions(tradRes.data as TraditionResult[]);
      if (drawRes.data) setAllDrawbacks(drawRes.data as DrawbackResult[]);
      if (boonRes.data) setAllBoons(boonRes.data as BoonResult[]);
      setRefLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Talents (3,938) use the ranked server RPC (exact → prefix → contains → sphere → tags →
  // description) so the best match surfaces first and isn't truncated by the limit. Debounced;
  // "" preloads, 1 char waits for more.
  useEffect(() => {
    if (mode !== "talents") return; // spheres/traditions rank instantly client-side
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_sphere_talents", {
        p_query: term,
        p_sphere: sphere,
        p_category: category,
        // When system-scoped we filter client-side (talents carry no system column), so fetch a
        // deeper slice to avoid the in-system matches being crowded out by the 40-row cut.
        p_limit: system ? 80 : 40,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setTalents([]);
      } else {
        setError(null);
        setTalents((data ?? []) as TalentResult[]);
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, sphere, category, mode, system, supabase]);

  const sphereOptions = useMemo(
    () => allSpheres.map((s) => ({ name: s.name, system: s.system })),
    [allSpheres],
  );
  // Map sphere name → system (full sphere_compendium is loaded), so talent results (which carry no
  // system column) can be scoped client-side, and so picked talents can be tagged with their system.
  const sphereSystemMap = useMemo(
    () => new Map(allSpheres.map((s) => [s.name.toLowerCase(), s.system])),
    [allSpheres],
  );
  const bySystem = useCallback(
    <T extends { system: string | null }>(items: T[]) => (system ? items.filter((i) => i.system === system) : items),
    [system],
  );
  const spheres = useMemo(
    () => rankByName(bySystem(allSpheres), mode === "spheres" ? q : ""),
    [allSpheres, q, mode, bySystem],
  );
  const traditions = useMemo(
    () => rankByName(allTraditions, mode === "traditions" ? q : ""),
    [allTraditions, q, mode],
  );
  const drawbacks = useMemo(
    () => rankByName(bySystem(allDrawbacks), mode === "drawbacks" ? q : ""),
    [allDrawbacks, q, mode, bySystem],
  );
  const boons = useMemo(() => rankByName(bySystem(allBoons), mode === "boons" ? q : ""), [allBoons, q, mode, bySystem]);
  const visibleTalents = useMemo(
    () => (system ? talents.filter((t) => sphereSystemMap.get(t.sphere_name.toLowerCase()) === system) : talents),
    [talents, system, sphereSystemMap],
  );

  const addedTalents = useMemo(
    () => new Set((ed.draft.spheres?.talents ?? []).map((t) => t.compendiumId).filter(Boolean)),
    [ed.draft.spheres?.talents],
  );
  const addedSpheres = useMemo(
    () => new Set((ed.draft.spheres?.spheres ?? []).map((s) => s.compendiumId).filter(Boolean)),
    [ed.draft.spheres?.spheres],
  );
  const addedDrawbacks = useMemo(() => new Set(ed.draft.spheres?.drawbacks ?? []), [ed.draft.spheres?.drawbacks]);
  const addedBoons = useMemo(() => new Set(ed.draft.spheres?.boons ?? []), [ed.draft.spheres?.boons]);
  const currentTradition = ed.draft.spheres ? (systemTradition(ed.draft.spheres, system ?? "Magic")?.name ?? "") : "";

  const ensure = (mut: (s: NonNullable<typeof ed.draft.spheres>) => void) =>
    ed.update((c) => {
      if (!c.spheres) {
        c.spheres = { casterClasses: [], spheres: [], talents: [], drawbacks: [], boons: [], bonusSpellPoints: 0 };
      }
      mut(c.spheres);
    });

  const addTalent = (r: TalentResult) =>
    ensure((s) => {
      if (s.talents.some((t) => t.compendiumId === r.id)) return;
      s.talents.push({
        id: newId("tal"),
        compendiumId: r.id,
        sphereName: r.sphere_name,
        talentName: r.talent_name,
        category: r.talent_category ?? undefined,
        system: system ?? (sphereSystemMap.get(r.sphere_name.toLowerCase()) as SphereSystem | undefined),
      });
    });
  const addSphere = (r: SphereResult) =>
    ensure((s) => {
      if (s.spheres.some((x) => x.compendiumId === r.id)) return;
      s.spheres.push({
        id: newId("sph"),
        compendiumId: r.id,
        name: r.name,
        system: (r.system === "Combat" || r.system === "Skill" ? r.system : "Magic") as "Magic" | "Combat" | "Skill",
      });
    });
  // Selecting a tradition sets it and applies its granted drawbacks/boons (prose → editable lines the
  // player can trim). Provenance-tracked, so switching A→B REPLACES the old grants instead of stacking.
  const applyTradition = (r: TraditionResult) =>
    ensure((s) =>
      // Apply to the scoped system (each system card opens the picker scoped); default Magic when unscoped.
      applySystemTradition(s, system ?? "Magic", {
        name: r.name,
        drawbacks: grantLines(r.drawbacks_gained),
        boons: grantLines(r.boons_gained),
      }),
    );
  const grantSys = (resultSystem: string | null): SphereSystem | undefined =>
    system ??
    (resultSystem === "Magic" || resultSystem === "Combat" || resultSystem === "Skill" ? resultSystem : undefined);
  const addDrawback = (r: DrawbackResult) =>
    ensure((s) => {
      if (!s.drawbacks.includes(r.name)) s.drawbacks.push(r.name);
      const sys = grantSys(r.system);
      if (sys) s.drawbackMeta = { ...(s.drawbackMeta ?? {}), [r.name]: { ...(s.drawbackMeta?.[r.name] ?? {}), system: sys } };
    });
  const addBoon = (r: BoonResult) =>
    ensure((s) => {
      if (!s.boons.includes(r.name)) s.boons.push(r.name);
      const sys = grantSys(r.system);
      if (sys) s.boonMeta = { ...(s.boonMeta ?? {}), [r.name]: { ...(s.boonMeta?.[r.name] ?? {}), system: sys } };
    });

  const placeholder =
    mode === "talents"
      ? "Search talents by name or text…"
      : mode === "spheres"
        ? "Search spheres…"
        : mode === "traditions"
          ? "Search traditions…"
          : mode === "drawbacks"
            ? "Search drawbacks…"
            : "Search boons…";

  return (
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> Compendium search
        </h4>
        <Button variant="ghost" size="icon" aria-label="Close compendium search" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div
        className="mb-2 flex gap-0.5 overflow-x-auto rounded-lg border border-border p-0.5 text-xs"
        role="group"
        aria-label="Compendium search mode"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onModeChange(m)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 capitalize ${
              mode === m ? "bg-gold/15 font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search the Spheres compendium"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
        />
        {mode === "talents" && loading && (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {mode === "talents" && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={sphere}
            onChange={(e) => setSphere(e.target.value)}
            aria-label="Filter by sphere"
            className="h-11 flex-1 rounded-lg border border-border bg-background px-2 text-xs text-foreground sm:h-9"
          >
            <option value="">All spheres</option>
            {SYSTEMS.map((sys) => {
              const names = sphereOptions.filter((s) => s.system === sys);
              if (names.length === 0) return null;
              return (
                <optgroup key={sys} label={sys}>
                  {names.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="h-11 rounded-lg border border-border bg-background px-2 text-xs text-foreground sm:h-9"
          >
            <option value="">All types</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "talents" && error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-2 flex max-h-[65vh] flex-col gap-1 overflow-y-auto sm:max-h-96">
        {mode === "talents" &&
          (visibleTalents.length === 0 && !loading ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {q.trim().length === 1 ? "Keep typing…" : "No talents found."}
            </li>
          ) : (
            visibleTalents.map((r) => {
              const isAdded = addedTalents.has(r.id);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{r.talent_name}</span>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[r.sphere_name, r.talent_category?.replace(" Talent", "")].filter(Boolean).join(" · ")}
                      {r.base_cost ? ` · ${r.base_cost}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? "ghost" : "secondary"}
                    disabled={isAdded}
                    onClick={() => addTalent(r)}
                    aria-label={`Add ${r.talent_name}`}
                    className="shrink-0"
                  >
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
            })
          ))}

        {mode === "spheres" &&
          (spheres.length === 0 ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {refLoading ? "Loading…" : q.trim().length === 1 ? "Keep typing…" : "No spheres found."}
            </li>
          ) : (
            spheres.map((r) => {
              const isAdded = addedSpheres.has(r.id);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                    <Badge variant="rune">{r.system}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? "ghost" : "secondary"}
                    disabled={isAdded}
                    onClick={() => addSphere(r)}
                    aria-label={`Add ${r.name}`}
                    className="shrink-0"
                  >
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
            })
          ))}

        {mode === "traditions" &&
          (traditions.length === 0 ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {refLoading ? "Loading…" : q.trim().length === 1 ? "Keep typing…" : "No traditions found."}
            </li>
          ) : (
            traditions.map((r) => {
              const isSelected = currentTradition === r.name;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                      {r.type && <Badge variant="outline">{r.type}</Badge>}
                    </div>
                    {(r.drawbacks_gained || r.boons_gained) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        Grants its drawbacks &amp; boons to your lists
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isSelected ? "ghost" : "secondary"}
                    disabled={isSelected}
                    onClick={() => applyTradition(r)}
                    aria-label={`Choose the ${r.name} tradition`}
                    className="shrink-0"
                  >
                    {isSelected ? (
                      <>
                        <Check className="size-4" /> Chosen
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" /> Choose
                      </>
                    )}
                  </Button>
                </li>
              );
            })
          ))}

        {mode === "drawbacks" &&
          (drawbacks.length === 0 ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {refLoading ? "Loading…" : q.trim().length === 1 ? "Keep typing…" : "No drawbacks found."}
            </li>
          ) : (
            drawbacks.map((r) => {
              const isAdded = addedDrawbacks.has(r.name);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                    {(r.sphere || r.tradition) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[r.sphere, r.tradition].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? "ghost" : "secondary"}
                    disabled={isAdded}
                    onClick={() => addDrawback(r)}
                    aria-label={`Add ${r.name}`}
                    className="shrink-0"
                  >
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
            })
          ))}

        {mode === "boons" &&
          (boons.length === 0 ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {refLoading ? "Loading…" : q.trim().length === 1 ? "Keep typing…" : "No boons found."}
            </li>
          ) : (
            boons.map((r) => {
              const isAdded = addedBoons.has(r.name);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                    {r.tradition && <p className="truncate text-[11px] text-muted-foreground">{r.tradition}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? "ghost" : "secondary"}
                    disabled={isAdded}
                    onClick={() => addBoon(r)}
                    aria-label={`Add ${r.name}`}
                    className="shrink-0"
                  >
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
            })
          ))}
      </ul>
    </div>
  );
}
