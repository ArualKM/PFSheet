"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check } from "lucide-react";
import { ScrollText } from "@/components/ui/game-icons";
import { createClient } from "@/lib/supabase/client";
import { brToNewlines } from "@/lib/character/psionic-powers";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow, Segmented } from "./picker-shell";

/**
 * Drawbacks & flaws picker (3PP Phase 6, module `flaws_drawbacks`) — hosted by the Traits editor
 * as a secondary Browse. The whole `threepp_drawback_compendium` is 42 rows, so it loads once
 * (module-scope cached) and search + the category chips filter client-side. Adding creates a
 * TraitEntry (type "Flaw" / "Drawback", compendiumId "3pp:<slug>") so drawbacks ride the existing
 * traits list — no new schema.
 */

type DrawbackRow = {
  slug: string;
  name: string | null;
  category: string | null;
  effect: string | null;
  bonus_granted: string | null;
  prerequisite: string | null;
  description: string | null;
  source: string | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

let browseCache: DrawbackRow[] | null = null;

type CategoryFilter = "all" | "flaw" | "major_drawback";

export function DrawbackPicker({
  ed,
  onClose,
  autoFocusSearch = true,
}: {
  ed: CharacterEditorApi;
  onClose: () => void;
  /** Suppress the search input's autofocus (the wizard steps opt out). Defaults to true so every
   * existing call site is unaffected. */
  autoFocusSearch?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DrawbackRow[]>(() => browseCache ?? []);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (browseCache) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any)
        .from("threepp_drawback_compendium")
        .select("slug,name,category,effect,bonus_granted,prerequisite,description,source")
        .order("name")
        .limit(200);
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setRows([]);
      } else {
        const fetched = ((data ?? []) as DrawbackRow[]).filter((r) => !!r.name);
        browseCache = fetched;
        setRows(fetched);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const added = new Set(ed.draft.traits.list.map((t) => t.compendiumId).filter(Boolean) as string[]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (term && !`${r.name} ${r.effect ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, q, category]);

  const addDrawback = (r: DrawbackRow) =>
    ed.update((c) => {
      const cid = `3pp:${r.slug}`;
      if (c.traits.list.some((t) => t.compendiumId === cid)) return;
      const bonus = brToNewlines(r.bonus_granted);
      const prereq = brToNewlines(r.prerequisite);
      // A major drawback GRANTS something in exchange — label that half clearly, never blend it
      // into the penalty text.
      const description = [
        brToNewlines(r.description),
        brToNewlines(r.effect),
        bonus ? `In exchange, this grants: ${bonus}` : undefined,
        prereq ? `Prerequisite: ${prereq}` : undefined,
      ]
        .filter(Boolean)
        .join("\n\n");
      c.traits.list.push({
        id: newId("trait"),
        name: String(r.name),
        type: r.category === "flaw" ? "Flaw" : "Drawback",
        compendiumId: cid,
        description: description || undefined,
        automation: [],
      });
    });

  return (
    <PickerShell icon={<ScrollText />} title="Drawbacks & flaws" onClose={onClose}>
      <PickerSearch
        autoFocus={autoFocusSearch}
        value={q}
        onChange={setQ}
        loading={loading}
        label="Search drawbacks and flaws"
        placeholder="Search — e.g. Frail, Easy Target…"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Segmented
          value={category}
          onChange={setCategory}
          ariaLabel="Filter by category"
          options={[
            { value: "all", label: "All" },
            { value: "flaw", label: "Flaws" },
            { value: "major_drawback", label: "Major drawbacks" },
          ]}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        A flaw or major drawback is taken in exchange for an extra feat or trait (per your
        table&rsquo;s rules) — add the granted pick yourself.
      </p>
      <PickerError message={error} />
      <PickerList isEmpty={visible.length === 0 && !loading} hint="No matches found.">
        {visible.map((r) => {
          const isAdded = added.has(`3pp:${r.slug}`);
          const effect = brToNewlines(r.effect);
          return (
            <PickerRow key={r.slug}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                    <span className="shrink-0 rounded border border-border bg-surface-sunken px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {r.category === "flaw" ? "Flaw" : "Drawback"}
                    </span>
                  </span>
                  {effect && <div className="truncate text-[11px] text-muted-foreground">{effect.replace(/\n/g, " ")}</div>}
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
              </div>
            </PickerRow>
          );
        })}
      </PickerList>
    </PickerShell>
  );
}
