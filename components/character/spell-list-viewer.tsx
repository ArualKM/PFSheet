"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { SpellView } from "@/lib/character/view-model";
import { groupSpellsByLevel, spellLevelLabel } from "@/lib/character/spell-groups";
import { CollapsibleGroup, COLLAPSE_WHEN_OVER } from "./collapsible-group";
import { SpellRow } from "./spell-row";

type SpellEntry = SpellView & { used?: number; prepared?: number };
type SortMode = "level" | "school" | "name";

const SORTS: { value: SortMode; label: string }[] = [
  { value: "level", label: "Level" },
  { value: "school", label: "School" },
  { value: "name", label: "A–Z" },
];

/**
 * Read-view spell list with search, sort (level / school / name), and per-level collapsible
 * grouping so a 40-known-spell sorcerer doesn't produce an endless page. Spells are always
 * grouped by level (the natural spell grouping); the sort only reorders spells within a level.
 * Every group defaults open when the whole list is short (≤ COLLAPSE_WHEN_OVER) and collapses
 * to a scannable index of level headers when long. An active search auto-expands any group that
 * contains a match (the groups are keyed on the query so the open state re-derives on change).
 * Client-side over already-gated, already-authorized data (no new fetch). The prepared used/total
 * counter is rendered internally (a function prop can't cross the server→client boundary — see
 * CharacterDashboard).
 */
export function SpellListViewer({
  title,
  spells,
  mythicAugments = false,
}: {
  title: string;
  spells: SpellEntry[];
  mythicAugments?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("level");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return q
      ? spells.filter(
          (s) => s.name.toLowerCase().includes(q) || (s.school ?? "").toLowerCase().includes(q),
        )
      : spells.slice();
  }, [spells, q]);

  const groups = useMemo(() => {
    const byLevel = groupSpellsByLevel(filtered);
    const bySort = (a: SpellEntry, b: SpellEntry) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "school") {
        const sc = (a.school ?? "").localeCompare(b.school ?? "");
        return sc !== 0 ? sc : a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    };
    return byLevel.map((g) => ({ level: g.level, spells: [...g.spells].sort(bySort) }));
  }, [filtered, sort]);

  // Short lists stay fully open; long ones collapse every group to a compact level index. An
  // active search overrides that so matching groups expand (the groups remount on `q` change).
  const openByDefault = filtered.length <= COLLAPSE_WHEN_OVER;

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
              className="h-11 w-28 rounded border border-border bg-background pl-7 pr-2 text-xs text-foreground sm:h-9 sm:w-36"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label={`Sort ${title}`}
            className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        {groups.map((g) => (
          <CollapsibleGroup
            key={`${g.level}-${q}`}
            title={spellLevelLabel(g.level)}
            count={g.spells.length}
            defaultOpen={openByDefault || q !== ""}
          >
            {g.spells.map((sp, i) => (
              <SpellRow
                key={`${sp.name}-${sp.level}-${i}`}
                spell={sp}
                mythicAugments={mythicAugments}
                right={
                  sp.prepared != null ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {sp.used ?? 0}/{sp.prepared}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </CollapsibleGroup>
        ))}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground">No spells match.</p>}
      </div>
    </div>
  );
}
