"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { SpellView } from "@/lib/character/view-model";
import { SpellRow } from "./spell-row";

type SpellEntry = SpellView & { used?: number; prepared?: number };
type SortMode = "level" | "school" | "name";

const SORTS: { value: SortMode; label: string }[] = [
  { value: "level", label: "Level" },
  { value: "school", label: "School" },
  { value: "name", label: "A–Z" },
];

const CAP = 12;

/**
 * Read-view spell list with search, sort (level / school+level / name), and collapse-by-default
 * so a 40-known-spell sorcerer doesn't produce an endless page. Client-side over already-gated,
 * already-authorized data (no new fetch). The prepared used/total counter is rendered internally
 * (a function prop can't cross the server→client boundary — see CharacterDashboard).
 */
export function SpellListViewer({ title, spells }: { title: string; spells: SpellEntry[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("level");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? spells.filter(
          (s) => s.name.toLowerCase().includes(q) || (s.school ?? "").toLowerCase().includes(q),
        )
      : spells.slice();
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "school") {
        const sc = (a.school ?? "").localeCompare(b.school ?? "");
        return sc !== 0 ? sc : a.level - b.level || a.name.localeCompare(b.name);
      }
      return a.level - b.level || a.name.localeCompare(b.name);
    });
    return list;
  }, [spells, query, sort]);

  const shown = showAll ? filtered : filtered.slice(0, CAP);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {title} <span className="text-foreground">({spells.length})</span>
        </span>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${title}`}
              className="h-7 w-24 rounded border border-border bg-background pl-7 pr-2 text-xs text-foreground sm:w-32"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label={`Sort ${title}`}
            className="h-7 rounded border border-border bg-background px-1 text-xs text-foreground"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        {shown.map((sp, i) => (
          <SpellRow
            key={`${sp.name}-${sp.level}-${i}`}
            spell={sp}
            right={
              sp.prepared != null ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {sp.used ?? 0}/{sp.prepared}
                </span>
              ) : undefined
            }
          />
        ))}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground">No spells match.</p>}
      </div>

      {filtered.length > CAP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-1.5 text-xs font-medium text-rune hover:underline"
        >
          {showAll ? "Show less" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}
