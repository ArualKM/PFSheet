"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CharacterEditorApi } from "./use-character-editor";

type OptionRow = {
  slug: string;
  class: string;
  option_type: string | null;
  name: string;
  subtype: string | null;
  description: string | null;
};

const esc = (s: string) => s.replace(/[%_\\]/g, "\\$&");

/**
 * Phase 4 — the choosable class-options sub-picker (Discoveries / Rogue Talents / Hexes / Bloodlines …).
 * Scoped to the character's classes; filter by option type + search, and a pick lands as a FeatureEntry
 * (category class_feature) tagged with its option type (the builder's chosen model — reuses everything).
 */
export function ClassOptionsPicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const classNames = useMemo(
    () => [...new Set(ed.draft.identity.classes.map((c) => c.compendiumPreset?.name ?? c.name).filter(Boolean))],
    [ed.draft.identity.classes],
  );
  const [cls, setCls] = useState(classNames[0] ?? "");
  const [optionType, setOptionType] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Distinct option types for the selected class (drives the type filter).
  useEffect(() => {
    if (!cls) return; // when there are no classes the picker shows a message instead of this UI
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("class_option_compendium").select("option_type").eq("class", cls);
      if (cancelled) return;
      const t = [...new Set(((data ?? []) as { option_type: string | null }[]).map((r) => r.option_type).filter(Boolean))].sort();
      setTypes(t as string[]);
      setOptionType("");
    })();
    return () => {
      cancelled = true;
    };
  }, [cls, supabase]);

  // Options for the class (+ type + name search). Capped at 100 (the type filter + search narrow it).
  useEffect(() => {
    if (!cls) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("class_option_compendium")
        .select("slug,class,option_type,name,subtype,description")
        .eq("class", cls)
        .order("name")
        .limit(100);
      if (optionType) query = query.eq("option_type", optionType);
      if (q.trim()) query = query.ilike("name", `%${esc(q.trim())}%`);
      const { data } = await query;
      if (cancelled) return;
      setRows((data ?? []) as OptionRow[]);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cls, optionType, q, supabase]);

  const added = useMemo(
    () => new Set(ed.draft.features.list.map((f) => f.compendiumId).filter(Boolean) as string[]),
    [ed.draft.features.list],
  );

  const addOption = (r: OptionRow) =>
    ed.update((c) => {
      if (c.features.list.some((f) => f.compendiumId === r.slug)) return;
      c.features.list.push({
        id: `opt_${r.slug}`,
        name: r.name,
        category: "class_feature",
        compendiumId: r.slug,
        description: [r.option_type, (r.description ?? "").replace(/<br>/g, " ")].filter(Boolean).join(": ") || undefined,
        automation: [],
      });
    });

  return (
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> Class options
        </h4>
        <Button variant="ghost" size="icon" aria-label="Close class options" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {classNames.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Add a class first to choose its options.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={cls}
              onChange={(e) => setCls(e.target.value)}
              aria-label="Class"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              {classNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              value={optionType}
              onChange={(e) => setOptionType(e.target.value)}
              aria-label="Option type"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="relative mt-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search options by name…"
              aria-label="Search class options"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
            />
            {loading && (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <ul className="mt-2 flex max-h-[55vh] flex-col gap-1 overflow-y-auto sm:max-h-80">
            {rows.length === 0 && !loading ? (
              <li className="px-1 py-2 text-sm text-muted-foreground">No options found.</li>
            ) : (
              rows.map((r) => {
                const isAdded = added.has(r.slug);
                return (
                  <li
                    key={r.slug}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                      {r.option_type && (
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Badge variant="rune">{r.option_type}</Badge>
                          {r.subtype}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "ghost" : "secondary"}
                      disabled={isAdded}
                      onClick={() => addOption(r)}
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
            )}
          </ul>
        </>
      )}
    </div>
  );
}
