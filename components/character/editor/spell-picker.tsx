"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, X, Loader2 } from "lucide-react";
import type { SpellcasterEntry } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SpellResult = {
  id: string;
  name: string;
  school: string | null;
  descriptor: string | null;
  class_level: number | null;
};

function titleCase(s: string): string {
  return s.trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** The highest spell level this caster can currently cast (from slots, else level-derived). */
function maxCastLevel(caster: SpellcasterEntry): number {
  let max = -1;
  for (const [lvl, slots] of Object.entries(caster.spellsPerDay ?? {})) {
    if ((slots?.total ?? 0) > 0) max = Math.max(max, Number(lvl));
  }
  if (max >= 0) return max;
  const cl = typeof caster.casterLevel === "number" ? caster.casterLevel : 0;
  return cl > 0 ? Math.min(9, Math.floor((cl + 1) / 2)) : 9;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function SpellPicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [onlyClassList, setOnlyClassList] = useState(true);
  const [onlyCastable, setOnlyCastable] = useState(true);
  const [results, setResults] = useState<SpellResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classes = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of ed.draft.spellcasting.casters) {
      const name = titleCase(c.className);
      if (!name) continue;
      out[name] = Math.max(out[name] ?? 0, maxCastLevel(c));
    }
    return out;
  }, [ed.draft.spellcasting.casters]);
  const hasCasters = Object.keys(classes).length > 0;

  const added = useMemo(
    () => new Set(ed.draft.spellcasting.knownSpells.map((s) => s.compendiumId).filter(Boolean)),
    [ed.draft.spellcasting.knownSpells],
  );

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return; // wait for 2+ chars; "" preloads
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_spell_compendium", {
        p_query: term,
        p_classes: classes as Json,
        p_only_class_list: onlyClassList,
        p_only_castable: onlyCastable,
        p_limit: 40,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setResults([]);
      } else {
        setError(null);
        setResults((data ?? []) as unknown as SpellResult[]);
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, onlyClassList, onlyCastable, classes, supabase]);

  const addSpell = (r: SpellResult) =>
    ed.update((c) => {
      if (c.spellcasting.knownSpells.some((s) => s.compendiumId === r.id)) return;
      c.spellcasting.knownSpells.push({
        id: newId("spell"),
        compendiumId: r.id,
        name: r.name,
        level: r.class_level ?? 0,
        school: r.school ?? undefined,
      });
    });

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

      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, school, descriptor, or text…"
        aria-label="Search spells"
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={onlyClassList}
            disabled={!hasCasters}
            onChange={(e) => setOnlyClassList(e.target.checked)}
            className="size-3.5 accent-[var(--pf-gold)]"
          />
          On my class list
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={onlyCastable}
            disabled={!hasCasters}
            onChange={(e) => setOnlyCastable(e.target.checked)}
            className="size-3.5 accent-[var(--pf-gold)]"
          />
          Can currently cast
        </label>
        {!hasCasters && <span className="text-warning">Add a casting class above to filter by class/level.</span>}
        {loading && <Loader2 className="size-3.5 animate-spin" />}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
        {results.length === 0 && !loading && (
          <li className="px-1 py-2 text-sm text-muted-foreground">
            {q.trim().length === 1 ? "Keep typing…" : "No spells found."}
          </li>
        )}
        {results.map((r) => {
          const isAdded = added.has(r.id);
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                  {r.class_level != null && <Badge variant="rune">L{r.class_level}</Badge>}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[r.school, r.descriptor].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button
                size="sm"
                variant={isAdded ? "ghost" : "secondary"}
                disabled={isAdded}
                onClick={() => addSpell(r)}
                aria-label={`Add ${r.name}`}
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
        })}
      </ul>
    </div>
  );
}
