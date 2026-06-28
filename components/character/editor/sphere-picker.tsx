"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Mode = "talents" | "spheres" | "traditions";

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

const CATEGORIES = ["Base Talent", "Advanced Talent", "Legendary Talent"];
const SYSTEMS = ["Magic", "Combat", "Skill"] as const;
const MODES: Mode[] = ["talents", "spheres", "traditions"];

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

/**
 * Compendium picker for the Spheres editor — searches sphere_talents / sphere_compendium /
 * sphere_traditions directly (public-read) and adds picks to character.spheres. Single-column results
 * so the long names stay readable in the editor's panel width (mobile + desktop alike). Picking a
 * tradition sets it and applies its granted drawbacks/boons as editable entries.
 */
export function SpherePicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>("talents");
  const [q, setQ] = useState("");
  const [sphere, setSphere] = useState("");
  const [category, setCategory] = useState("");
  const [sphereOptions, setSphereOptions] = useState<{ name: string; system: string }[]>([]);
  const [talents, setTalents] = useState<TalentResult[]>([]);
  const [spheres, setSpheres] = useState<SphereResult[]>([]);
  const [traditions, setTraditions] = useState<TraditionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sphere filter options (loaded once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("sphere_compendium")
        .select("name,system")
        .order("system", { ascending: true })
        .order("name", { ascending: true });
      if (!cancelled && data) setSphereOptions(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Debounced search per mode. "" preloads; 1 char waits for more.
  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      if (mode === "talents") {
        let query = supabase
          .from("sphere_talents")
          .select("id,sphere_name,talent_name,talent_category,subcategory,base_cost,prerequisites,source,description");
        if (term) query = query.textSearch("search_vector", term, { type: "websearch" });
        if (sphere) query = query.eq("sphere_name", sphere);
        if (category) query = query.eq("talent_category", category);
        const { data, error } = await query
          .order("sphere_name", { ascending: true })
          .order("talent_name", { ascending: true })
          .limit(40);
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setTalents([]);
        } else {
          setError(null);
          setTalents((data ?? []) as TalentResult[]);
        }
      } else if (mode === "spheres") {
        let query = supabase.from("sphere_compendium").select("id,name,system");
        if (term) query = query.textSearch("search_vector", term, { type: "websearch" });
        const { data, error } = await query.order("system", { ascending: true }).order("name", { ascending: true }).limit(60);
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setSpheres([]);
        } else {
          setError(null);
          setSpheres((data ?? []) as SphereResult[]);
        }
      } else {
        let query = supabase.from("sphere_traditions").select("id,name,type,drawbacks_gained,boons_gained,description");
        if (term) query = query.textSearch("search_vector", term, { type: "websearch" });
        const { data, error } = await query.order("name", { ascending: true }).limit(60);
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setTraditions([]);
        } else {
          setError(null);
          setTraditions((data ?? []) as TraditionResult[]);
        }
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, sphere, category, mode, supabase]);

  const addedTalents = useMemo(
    () => new Set((ed.draft.spheres?.talents ?? []).map((t) => t.compendiumId).filter(Boolean)),
    [ed.draft.spheres?.talents],
  );
  const addedSpheres = useMemo(
    () => new Set((ed.draft.spheres?.spheres ?? []).map((s) => s.compendiumId).filter(Boolean)),
    [ed.draft.spheres?.spheres],
  );
  const currentTradition = ed.draft.spheres?.tradition ?? "";

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
  // player can trim), de-duped so re-picking doesn't pile up.
  const applyTradition = (r: TraditionResult) =>
    ensure((s) => {
      s.tradition = r.name;
      for (const d of grantLines(r.drawbacks_gained)) if (!s.drawbacks.includes(d)) s.drawbacks.push(d);
      for (const b of grantLines(r.boons_gained)) if (!s.boons.includes(b)) s.boons.push(b);
    });

  const placeholder =
    mode === "talents"
      ? "Search talents by name or text…"
      : mode === "spheres"
        ? "Search spheres…"
        : "Search traditions…";

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
        className="mb-2 inline-flex rounded-lg border border-border p-0.5 text-xs"
        role="group"
        aria-label="Compendium search mode"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1 capitalize ${
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
        {loading && (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {mode === "talents" && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={sphere}
            onChange={(e) => setSphere(e.target.value)}
            aria-label="Filter by sphere"
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
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
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
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

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-2 flex max-h-[65vh] flex-col gap-1 overflow-y-auto sm:max-h-96">
        {mode === "talents" &&
          (talents.length === 0 && !loading ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {q.trim().length === 1 ? "Keep typing…" : "No talents found."}
            </li>
          ) : (
            talents.map((r) => {
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
          (spheres.length === 0 && !loading ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {q.trim().length === 1 ? "Keep typing…" : "No spheres found."}
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
          (traditions.length === 0 && !loading ? (
            <li className="px-1 py-2 text-sm text-muted-foreground">
              {q.trim().length === 1 ? "Keep typing…" : "No traditions found."}
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
      </ul>
    </div>
  );
}
