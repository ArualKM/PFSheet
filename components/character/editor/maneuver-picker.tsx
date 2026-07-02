"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check, ChevronDown, RefreshCw } from "lucide-react";
import { Swords } from "@/components/ui/game-icons";
import type { PowManeuver } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
// brToNewlines is the shared "<br>"-rich-text normalizer (psionic-powers.ts hosts it for all 3pp pickers).
import { brToNewlines } from "@/lib/character/psionic-powers";
import { parseManeuverLevel } from "@/lib/character/path-of-war-presets";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow } from "./picker-shell";
import { cn } from "@/lib/utils";

/** The compendium columns the picker reads — all cached onto the sheet by addManeuver except
 * descriptor + source (detail-row display only; source becomes a sourceRef book). */
const MANEUVER_COLUMNS =
  "slug,name,discipline,level,category,type,descriptor,initiation_action,range,target,duration,saving_throw,prerequisite,description,source";

type ManeuverRowData = {
  slug: string;
  name: string | null;
  discipline: string | null;
  level: string | null;
  category: string | null;
  type: string | null;
  descriptor: string | null;
  initiation_action: string | null;
  range: string | null;
  target: string | null;
  duration: string | null;
  saving_throw: string | null;
  prerequisite: string | null;
  description: string | null;
  source: string | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const nameKey = (s: string) => s.trim().toLowerCase();
/** Cap rendered rows — the full table is 758 maneuvers; filters narrow the rest. */
const SHOW_CAP = 200;

/** Module-scope cache: the picker unmounts on Close, but the full table (758 rows with rules
 * text, ~600KB uncompressed) must not re-download on every Browse open in a normal
 * add-close-reopen editing flow (mobile-first standing rule). Populated once per page load. */
let browseCache: ManeuverRowData[] | null = null;

/** Client-side hierarchical ranking (the sphere-picker rankByName pattern plus a rules-text
 * tier): exact name → name starts-with → name contains → text contains; non-matches drop.
 * Searching the ALREADY-LOADED table keeps the structural filters complete — the old ranked-RPC
 * path truncated at 60 rows BEFORE the client filters ran, silently hiding matching maneuvers
 * (e.g. "strike" + a discipline filter showed 0 of the discipline's real hits). */
function rankManeuvers(rows: ManeuverRowData[], term: string): ManeuverRowData[] {
  const q = term.trim().toLowerCase();
  if (!q) return rows;
  const tier = (r: ManeuverRowData): number => {
    const n = (r.name ?? "").toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    const text = [r.discipline, r.type, r.category, r.descriptor, r.description]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return text.includes(q) ? 3 : 99;
  };
  return rows
    .map((r) => ({ r, t: tier(r) }))
    .filter((x) => x.t < 99)
    .sort((a, b) => a.t - b.t || (a.r.name ?? "").localeCompare(b.r.name ?? ""))
    .map((x) => x.r);
}

/** The type filter's fixed options (matched as case-insensitive substrings — prod `type` values
 * carry compounds like "Strike [teleportation]"). Stances also match by category. */
const TYPE_FILTERS = ["Strike", "Boost", "Counter", "Stance"] as const;

const isStanceRow = (r: ManeuverRowData) => /stance/i.test(r.category ?? "") || /stance/i.test(r.type ?? "");

/**
 * Path of War maneuver picker (3PP Phase 4) — loads the full 758-row `pow_maneuver_compendium`
 * once (module-scope cached across open/close), then EVERYTHING is client-side: the query ranks
 * by name-then-text over the whole table (never a truncated server page, so the discipline /
 * type / level / "I can learn" filters always see every match). Adding caches the full compendium
 * detail onto the `pathOfWar.maneuvers` entry (compendiumId `3pp:${slug}`) so the sheet + read
 * view render without a DB round-trip.
 */
export function ManeuverPicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseRows, setBrowseRows] = useState<ManeuverRowData[]>(() => browseCache ?? []);
  const [discipline, setDiscipline] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  // Brief "Updated ✓" feedback after re-syncing an already-added maneuver from the compendium.
  const [updatedSlug, setUpdatedSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!updatedSlug) return;
    const t = setTimeout(() => setUpdatedSlug(null), 1600);
    return () => clearTimeout(t);
  }, [updatedSlug]);

  // The character's highest learnable maneuver level (max across initiators; 0 when the engine
  // emits no summary, e.g. module toggled off with leftover data) drives the "I can learn" filter.
  const maxLearnable = ed.computed.summary.pathOfWar?.highestManeuverLevel ?? 0;
  const [canLearnOnly, setCanLearnOnly] = useState(maxLearnable > 0);

  const added = useMemo(() => {
    const s = new Set<string>();
    for (const m of ed.draft.pathOfWar?.maneuvers ?? []) {
      if (m.compendiumId) s.add(m.compendiumId);
      s.add(`name:${nameKey(m.name)}`);
    }
    return s;
  }, [ed.draft.pathOfWar?.maneuvers]);
  const isAdded = (r: ManeuverRowData) => added.has(`3pp:${r.slug}`) || added.has(`name:${nameKey(r.name ?? r.slug)}`);

  // The whole table once (758 rows — one request, module-cached, then every keystroke/filter is
  // instant and complete). Fails soft; a retryable error message shows instead of rows.
  useEffect(() => {
    if (browseCache) return; // already loaded this page-load — state was seeded from the cache
    let cancelled = false;
    (async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: be } = await (supabase as any)
        .from("pow_maneuver_compendium")
        .select(MANEUVER_COLUMNS)
        .order("name")
        .limit(1000);
      if (cancelled) return;
      if (be) {
        setError(be.message);
        setBrowseRows([]);
      } else {
        const rows = ((data ?? []) as ManeuverRowData[]).filter((r) => !!r.name);
        browseCache = rows;
        setBrowseRows(rows);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const source = useMemo(() => rankManeuvers(browseRows, q), [browseRows, q]);

  // Discipline options from the full browse list (all 758 rows load anyway, so distinct-over-rows
  // is complete AND guaranteed to match the values the filter compares against).
  const disciplineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of browseRows) {
      const d = r.discipline?.trim();
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [browseRows]);

  const visible = useMemo(() => {
    return source.filter((r) => {
      if (discipline && (r.discipline?.trim().toLowerCase() ?? "") !== discipline.toLowerCase()) return false;
      if (typeFilter) {
        const matchesType =
          (r.type ?? "").toLowerCase().includes(typeFilter.toLowerCase()) ||
          (typeFilter === "Stance" && isStanceRow(r));
        if (!matchesType) return false;
      }
      const lvl = parseManeuverLevel(r.level);
      if (levelFilter !== "" && lvl !== Number(levelFilter)) return false;
      // Unknown levels stay visible — the filter trims, it never hides unparseable data.
      if (canLearnOnly && maxLearnable > 0 && lvl != null && lvl > maxLearnable) return false;
      return true;
    });
  }, [source, discipline, typeFilter, levelFilter, canLearnOnly, maxLearnable]);
  const shown = visible.slice(0, SHOW_CAP);

  const addManeuver = (r: ManeuverRowData) =>
    ed.update((c) => {
      if (!c.pathOfWar) c.pathOfWar = { initiators: [], maneuvers: [] };
      const cid = `3pp:${r.slug}`;
      const key = nameKey(r.name ?? r.slug);
      const lvl = parseManeuverLevel(r.level);
      // Cached detail ("<br>" → newlines so the sheet stores plain text). undefined fields are
      // stripped before merging into an existing entry so a manual value is never erased.
      const detail: Partial<PowManeuver> = {
        name: r.name ?? r.slug,
        compendiumId: cid,
        discipline: r.discipline?.trim() || undefined,
        entryKind: isStanceRow(r) ? "stance" : "maneuver",
        maneuverType: brToNewlines(r.type),
        initiationAction: brToNewlines(r.initiation_action),
        range: brToNewlines(r.range),
        target: brToNewlines(r.target),
        duration: brToNewlines(r.duration),
        savingThrow: brToNewlines(r.saving_throw),
        prerequisites: brToNewlines(r.prerequisite),
        description: brToNewlines(r.description),
        source: r.source ? { book: r.source } : undefined,
      };
      for (const k of Object.keys(detail) as (keyof PowManeuver)[]) {
        if (detail[k] === undefined) delete detail[k];
      }
      const existing = c.pathOfWar.maneuvers.find((m) => m.compendiumId === cid || nameKey(m.name) === key);
      if (existing) {
        const prevKind = existing.entryKind;
        Object.assign(existing, detail);
        if (lvl != null) existing.level = lvl;
        // A kind flip (a manually-entered "maneuver" that is really a compendium stance, or the
        // reverse) clears the lifecycle flags the new kind can't use — mirrors the editor's Kind
        // select, so a phantom readied=true can't skew the readied counts invisibly and a stale
        // stanceActive can't self-reactivate on a later kind round-trip.
        if (existing.entryKind !== prevKind) {
          if (existing.entryKind === "stance") {
            existing.readied = false;
            existing.expended = false;
            existing.granted = false;
            existing.stanceActive = false;
          } else {
            existing.stanceActive = false;
          }
        }
      } else {
        // Sole initiator → attribute the pick to it (matches the engine's fallback anyway, but
        // keeps the attribution explicit if a second initiator is added later).
        const soleInitiator = c.pathOfWar.initiators.length === 1 ? c.pathOfWar.initiators[0]!.id : undefined;
        c.pathOfWar.maneuvers.push({
          id: newId("mvr"),
          name: r.name ?? r.slug,
          level: lvl ?? 1,
          entryKind: isStanceRow(r) ? "stance" : "maneuver",
          readied: false,
          expended: false,
          granted: false,
          stanceActive: false,
          automation: [],
          ...(soleInitiator ? { initiatorId: soleInitiator } : {}),
          ...detail,
        });
      }
    });

  return (
    <PickerShell icon={<Swords />} title="Maneuver compendium" onClose={onClose}>
      <PickerSearch
        autoFocus
        value={q}
        onChange={setQ}
        loading={loading}
        label="Search maneuvers"
        placeholder="Search maneuvers by name or text…"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <label className="flex min-h-11 items-center gap-1.5 sm:min-h-0">
          <input
            type="checkbox"
            checked={canLearnOnly && maxLearnable > 0}
            disabled={maxLearnable <= 0}
            onChange={(e) => setCanLearnOnly(e.target.checked)}
            className="size-3.5 accent-[var(--pf-gold)]"
          />
          I can learn (≤ L{maxLearnable || "?"})
        </label>
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          aria-label="Filter by discipline"
          className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        >
          <option value="">All disciplines</option>
          {disciplineOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by maneuver type"
          className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        >
          <option value="">All types</option>
          {TYPE_FILTERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          aria-label="Filter by maneuver level"
          className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        >
          <option value="">All levels</option>
          {Array.from({ length: 9 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              Level {i + 1}
            </option>
          ))}
        </select>
        {maxLearnable <= 0 && <span className="text-warning">Add an initiator above to gate by your max level.</span>}
      </div>

      <PickerError message={error} />
      <PickerList
        isEmpty={shown.length === 0 && !loading}
        hint="No maneuvers found — try a different search or clear the filters."
      >
        {shown.map((r) => {
          const addedRow = isAdded(r);
          const open = openSlug === r.slug;
          const lvl = parseManeuverLevel(r.level);
          const meta = [r.discipline?.trim(), brToNewlines(r.type)?.replace(/\n/g, ", ")].filter(Boolean).join(" · ");
          const detailId = `maneuver-detail-${r.slug}`;
          const description = brToNewlines(r.description);
          const hasDetail = Boolean(
            description || r.initiation_action || r.range || r.target || r.duration || r.saving_throw || r.prerequisite,
          );
          return (
            <PickerRow key={r.slug}>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => hasDetail && setOpenSlug(open ? null : r.slug)}
                  aria-expanded={hasDetail ? open : undefined}
                  aria-controls={hasDetail ? detailId : undefined}
                  disabled={!hasDetail}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default sm:min-h-9"
                >
                  {hasDetail ? (
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                  {lvl != null && (
                    <Badge variant="rune" className="shrink-0 text-[10px]">
                      L{lvl}
                    </Badge>
                  )}
                  {isStanceRow(r) && (
                    <Badge variant="gold" className="shrink-0 text-[10px]">
                      Stance
                    </Badge>
                  )}
                </button>
                {/* Already-added rows stay ENABLED as "Update": the merge branch in addManeuver
                    re-syncs the cached compendium detail onto the existing entry (imported /
                    manual maneuvers gain action/range/save/…; manual values are never erased). */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    addManeuver(r);
                    if (addedRow) setUpdatedSlug(r.slug);
                  }}
                  aria-label={
                    addedRow ? `Update ${r.name ?? r.slug} from the compendium` : `Add ${r.name ?? r.slug}`
                  }
                  className="shrink-0"
                >
                  {addedRow ? (
                    updatedSlug === r.slug ? (
                      <>
                        <Check className="size-4" /> Updated
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-4" /> Update
                      </>
                    )
                  ) : (
                    <>
                      <Plus className="size-4" /> Add
                    </>
                  )}
                </Button>
              </div>
              {meta && <p className="mt-0.5 truncate pl-5 text-[11px] text-muted-foreground">{meta}</p>}
              {open && hasDetail && (
                <div id={detailId} className="mt-1.5 border-t border-border/50 pt-1.5 text-xs">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <ManeuverDetailField label="Descriptor" value={brToNewlines(r.descriptor)} />
                    <ManeuverDetailField label="Initiation action" value={brToNewlines(r.initiation_action)} />
                    <ManeuverDetailField label="Range" value={brToNewlines(r.range)} />
                    <ManeuverDetailField label="Target" value={brToNewlines(r.target)} />
                    <ManeuverDetailField label="Duration" value={brToNewlines(r.duration)} />
                    <ManeuverDetailField label="Save" value={brToNewlines(r.saving_throw)} />
                    <ManeuverDetailField label="Prerequisite" value={brToNewlines(r.prerequisite)} />
                  </dl>
                  {description && <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{description}</p>}
                  {r.source && <p className="mt-1.5 text-[11px] text-muted-foreground">{r.source}</p>}
                </div>
              )}
            </PickerRow>
          );
        })}
        {visible.length > SHOW_CAP && (
          <li className="px-3 py-2 text-center text-xs text-muted-foreground">
            …and {visible.length - SHOW_CAP} more — refine your search or filters.
          </li>
        )}
      </PickerList>
    </PickerShell>
  );
}

function ManeuverDetailField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-foreground">{value}</dd>
    </>
  );
}
