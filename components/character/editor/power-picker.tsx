"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check, Brain, ChevronDown, RefreshCw } from "lucide-react";
import type { PsionicPowerEntry } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
import {
  matchesManifesterClass,
  extractPpCost,
  parseJunctionLevel,
  disciplineParts,
  baseDiscipline,
  brToNewlines,
} from "@/lib/character/psionic-powers";
import { fetchAllRows } from "@/lib/character/fetch-all-rows";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow } from "./picker-shell";
import { cn } from "@/lib/utils";

/** The compendium columns the picker reads — cached onto the sheet by addPower, except
 * power_points (only a BARE integer becomes ppCost; variant text stays detail-row-only)
 * and source (detail-row display only). */
const POWER_COLUMNS =
  "slug,name,discipline,descriptors,display,manifesting_time,range,target_area_effect,duration,saving_throw,power_resistance,power_points,description,augment,special,mythic,source";

type PowerRowData = {
  slug: string;
  name: string | null;
  discipline: string | null;
  descriptors: string | null;
  display: string | null;
  manifesting_time: string | null;
  range: string | null;
  target_area_effect: string | null;
  duration: string | null;
  saving_throw: string | null;
  power_resistance: string | null;
  power_points: string | null;
  description: string | null;
  augment: string | null;
  special: string | null;
  mythic: string | null;
  source: string | null;
};

/** A result row: compendium data + the power's level (junction level for the character's classes). */
type ResultRow = PowerRowData & { level?: number };

// PostgREST `.or()` escaping — same semantics as feat-picker/compendium-browser: double-quote the
// value and escape LIKE metacharacters inside the pattern.
const pgQuote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const likePattern = (v: string) => `%${v.replace(/\\/g, "\\\\").replace(/[%_]/g, (m) => `\\${m}`)}%`;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const nameKey = (s: string) => s.trim().toLowerCase();
/** Cap rendered rows — a full Psion/Wilder class list is ~400 powers; filters narrow the rest. */
const SHOW_CAP = 200;

/**
 * Psionic power picker (3PP Phase 3A) — class-list mode joins the psionic_power_class_level
 * junction (compound "Psion/Wilder" class values) to psionic_power_compendium client-side and
 * orders by the character's per-class power level; toggling it off searches all 678 powers via
 * the ranked RPC. Adding a power caches the full compendium detail onto the powersKnown entry
 * (compendiumId `3pp:${slug}`) so the sheet + read view render without a DB round-trip.
 */
export function PowerPicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classRows, setClassRows] = useState<ResultRow[]>([]);
  const [rpcRows, setRpcRows] = useState<ResultRow[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  // Brief "Updated ✓" feedback after re-syncing an already-added power from the compendium.
  const [updatedSlug, setUpdatedSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!updatedSlug) return;
    const t = setTimeout(() => setUpdatedSlug(null), 1600);
    return () => clearTimeout(t);
  }, [updatedSlug]);

  // The character's manifester class names (compound "Psion/Wilder" entries split into segments,
  // archetype parens stripped, deduped) drive class-list mode. The split matters server-side: the
  // junction stores single-valued classes, so an ilike on the compound string would match nothing.
  const classNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const cl of ed.draft.psionics?.classes ?? []) {
      for (const part of cl.className.split("/")) {
        const name = part.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        out.push(name);
      }
    }
    return out;
  }, [ed.draft.psionics?.classes]);
  const hasClasses = classNames.length > 0;
  // Stable key so the class-list fetch refires only when the class SET changes, not on every
  // draft structuredClone (the spell-picker precedent).
  const classesKey = classNames.map((c) => c.toLowerCase()).join("|");
  const [classListMode, setClassListMode] = useState(hasClasses);
  const inClassListMode = classListMode && hasClasses;

  const added = useMemo(() => {
    const s = new Set<string>();
    for (const p of ed.draft.psionics?.powersKnown ?? []) {
      if (p.compendiumId) s.add(p.compendiumId);
      s.add(`name:${nameKey(p.name)}`);
    }
    return s;
  }, [ed.draft.psionics?.powersKnown]);
  const isAdded = (r: ResultRow) => added.has(`3pp:${r.slug}`) || added.has(`name:${nameKey(r.name ?? r.slug)}`);

  // Class-list mode: junction (server-side ilike per class — compound values — verified
  // client-side by matchesManifesterClass) → compendium rows batched ≤200 names per .in().
  useEffect(() => {
    if (!inClassListMode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // class='All' junction rows ("All classes N") grant the power to EVERY manifester — always
      // included alongside the character's own classes (matchesManifesterClass mirrors this).
      const orExpr = [
        ...classNames.map((c) => `class.ilike.${pgQuote(likePattern(c))}`),
        `class.eq.${pgQuote("All")}`,
      ].join(",");
      // Paged via .range(): PostgREST caps ONE response at 1,000 rows, so a flat `.limit(3000)`
      // would silently truncate the junction the moment the filtered set crosses the cap (the
      // exact bug that hit the 1,332-row veil compendium).
      const { rows: jr, error: je } = await fetchAllRows<{ power: string; class: string; level: string | null }>(
        (from, to) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("psionic_power_class_level")
            .select("power,class,level")
            .or(orExpr)
            .order("power")
            .order("class")
            .range(from, to),
      );
      if (cancelled) return;
      if (je) {
        setError(je.message);
        setClassRows([]);
        setLoading(false);
        return;
      }
      const originalName = new Map<string, string>();
      const levelByName = new Map<string, number>();
      for (const row of jr) {
        // Belt-and-suspenders: ilike %psion% could over-match; the split-based helper decides.
        if (!classNames.some((c) => matchesManifesterClass(row.class, c))) continue;
        const key = nameKey(row.power);
        if (!key) continue;
        originalName.set(key, row.power.trim());
        const lvl = parseJunctionLevel(row.level);
        if (lvl != null) {
          const prev = levelByName.get(key);
          if (prev == null || lvl < prev) levelByName.set(key, lvl); // multiple classes → lowest
        }
      }
      const names = [...originalName.values()];
      const rows: PowerRowData[] = [];
      let fetchError: string | null = null;
      for (let i = 0; i < names.length; i += 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cr, error: ce } = await (supabase as any)
          .from("psionic_power_compendium")
          .select(POWER_COLUMNS)
          .in("name", names.slice(i, i + 200));
        if (ce) {
          fetchError = ce.message;
          break;
        }
        rows.push(...((cr ?? []) as PowerRowData[]));
      }
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError);
        setClassRows([]);
        setLoading(false);
        return;
      }
      const merged: ResultRow[] = rows
        .filter((r) => !!r.name)
        .map((r) => ({ ...r, level: levelByName.get(nameKey(r.name!)) }));
      merged.sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || (a.name ?? "").localeCompare(b.name ?? ""));
      setClassRows(merged);
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // classNames is identity-unstable per draft clone; classesKey is its stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inClassListMode, classesKey, supabase]);

  // RPC mode: ranked search over all powers, then one junction probe on the visible names for
  // level badges (character's classes preferred, else the lowest level any class gets it).
  useEffect(() => {
    if (inClassListMode) return;
    const term = q.trim();
    if (term.length === 1) return; // 1 char waits for more; "" preloads
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error: re } = await supabase.rpc("search_psionic_power_compendium", {
        p_query: term,
        p_limit: 40,
      });
      if (cancelled) return;
      if (re) {
        setError(re.message);
        setRpcRows([]);
        setLoading(false);
        return;
      }
      const rows = ((data ?? []) as PowerRowData[]).filter((r) => !!r.name);
      let withLevels: ResultRow[] = rows;
      if (rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: jr } = await (supabase as any)
          .from("psionic_power_class_level")
          .select("power,class,level")
          .in("power", rows.map((r) => r.name!.trim()));
        if (jr) {
          const mineByKey = new Map<string, number>();
          const anyByKey = new Map<string, number>();
          for (const row of jr as { power: string; class: string; level: string | null }[]) {
            const lvl = parseJunctionLevel(row.level);
            if (lvl == null) continue;
            const key = nameKey(row.power);
            const map = classNames.some((c) => matchesManifesterClass(row.class, c)) ? mineByKey : anyByKey;
            const prev = map.get(key);
            if (prev == null || lvl < prev) map.set(key, lvl);
          }
          withLevels = rows.map((r) => {
            const key = nameKey(r.name!);
            return { ...r, level: mineByKey.get(key) ?? anyByKey.get(key) };
          });
        }
      }
      if (cancelled) return;
      setRpcRows(withLevels);
      setError(null);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // classNames captured via classesKey (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inClassListMode, q, classesKey, supabase]);

  const source = inClassListMode ? classRows : rpcRows;

  // Discipline options from the loaded rows ("<br>" compounds split into clean parts).
  const disciplineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of source) {
      for (const part of disciplineParts(r.discipline)) {
        const base = baseDiscipline(part);
        if (base) set.add(base);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [source]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return source.filter((r) => {
      // In class-list mode the query filters client-side (the list is already fully loaded).
      if (inClassListMode && term) {
        const hay = `${r.name ?? ""} ${r.discipline ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (discipline && !disciplineParts(r.discipline).some((p) => baseDiscipline(p).toLowerCase() === discipline.toLowerCase())) {
        return false;
      }
      if (inClassListMode && levelFilter !== "" && r.level !== Number(levelFilter)) return false;
      return true;
    });
  }, [source, q, discipline, levelFilter, inClassListMode]);
  const shown = visible.slice(0, SHOW_CAP);

  const addPower = (r: ResultRow) =>
    ed.update((c) => {
      if (!c.psionics) c.psionics = { classes: [], powersKnown: [] };
      const cid = `3pp:${r.slug}`;
      const key = nameKey(r.name ?? r.slug);
      const lvl = r.level != null ? Math.max(0, Math.min(9, r.level)) : undefined;
      // Cached detail ("<br>" → newlines so the sheet stores plain text). undefined fields are
      // stripped before merging into an existing entry so a manual value is never erased.
      const detail: Partial<PsionicPowerEntry> = {
        name: r.name ?? r.slug,
        compendiumId: cid,
        discipline: disciplineParts(r.discipline).join("; ") || undefined,
        descriptors: brToNewlines(r.descriptors),
        ppCost: extractPpCost(r.power_points),
        display: brToNewlines(r.display),
        manifestingTime: brToNewlines(r.manifesting_time),
        range: brToNewlines(r.range),
        targetAreaEffect: brToNewlines(r.target_area_effect),
        duration: brToNewlines(r.duration),
        savingThrow: brToNewlines(r.saving_throw),
        powerResistance: brToNewlines(r.power_resistance),
        description: brToNewlines(r.description),
        augment: brToNewlines(r.augment),
        special: brToNewlines(r.special),
        mythic: brToNewlines(r.mythic),
      };
      for (const k of Object.keys(detail) as (keyof PsionicPowerEntry)[]) {
        if (detail[k] === undefined) delete detail[k];
      }
      const existing = c.psionics.powersKnown.find(
        (p) => p.compendiumId === cid || nameKey(p.name) === key,
      );
      if (existing) {
        Object.assign(existing, detail);
        if (lvl != null) existing.level = lvl;
      } else {
        c.psionics.powersKnown.push({
          id: newId("pow"),
          name: r.name ?? r.slug,
          level: lvl ?? 1,
          ...detail,
        });
      }
    });

  return (
    <PickerShell icon={<Brain />} title="Power compendium" onClose={onClose}>
      <PickerSearch
        autoFocus
        value={q}
        onChange={setQ}
        loading={loading}
        label="Search psionic powers"
        placeholder="Search powers by name or text…"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <label className="flex min-h-11 items-center gap-1.5 sm:min-h-0">
          <input
            type="checkbox"
            checked={inClassListMode}
            disabled={!hasClasses}
            onChange={(e) => setClassListMode(e.target.checked)}
            className="size-3.5 accent-[var(--pf-gold)]"
          />
          On my class list
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
        {inClassListMode && (
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            aria-label="Filter by power level"
            className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
          >
            <option value="">All levels</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={String(i)}>
                Level {i}
              </option>
            ))}
          </select>
        )}
        {!hasClasses && <span className="text-warning">Add a psionic class above to browse your class list.</span>}
      </div>

      <PickerError message={error} />
      <PickerList
        isEmpty={shown.length === 0 && !loading}
        hint={
          !inClassListMode && q.trim().length === 1
            ? "Keep typing…"
            : "No powers found — try clearing the filters."
        }
      >
        {shown.map((r) => {
          const addedRow = isAdded(r);
          const open = openSlug === r.slug;
          const pp = extractPpCost(r.power_points);
          const disc = disciplineParts(r.discipline).join("; ");
          const meta = [disc, brToNewlines(r.display)?.replace(/\n/g, ", ")].filter(Boolean).join(" · ");
          const detailId = `power-detail-${r.slug}`;
          const description = brToNewlines(r.description);
          const augment = brToNewlines(r.augment);
          const mythic = brToNewlines(r.mythic);
          const hasDetail = Boolean(
            description || augment || mythic || r.manifesting_time || r.range || r.duration || r.saving_throw || r.power_resistance || r.power_points,
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
                  {r.level != null && (
                    <Badge variant="rune" className="shrink-0 text-[10px]">
                      L{r.level}
                    </Badge>
                  )}
                  {pp != null && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {pp} PP
                    </Badge>
                  )}
                </button>
                {/* Already-added rows stay ENABLED as "Update": the merge branch in addPower
                    re-syncs the cached compendium detail onto the existing entry (imported /
                    manual powers gain range/save/duration/…; manual values are never erased). */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    addPower(r);
                    if (addedRow) setUpdatedSlug(r.slug);
                  }}
                  aria-label={
                    addedRow
                      ? `Update ${r.name ?? r.slug} from the compendium`
                      : `Add ${r.name ?? r.slug}`
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
                    <PowerDetailField label="Descriptors" value={brToNewlines(r.descriptors)} />
                    <PowerDetailField label="Display" value={brToNewlines(r.display)} />
                    <PowerDetailField label="Manifesting time" value={brToNewlines(r.manifesting_time)} />
                    <PowerDetailField label="Range" value={brToNewlines(r.range)} />
                    <PowerDetailField label="Target/Area" value={brToNewlines(r.target_area_effect)} />
                    <PowerDetailField label="Duration" value={brToNewlines(r.duration)} />
                    <PowerDetailField label="Save" value={brToNewlines(r.saving_throw)} />
                    <PowerDetailField label="Power resistance" value={brToNewlines(r.power_resistance)} />
                    <PowerDetailField label="Power points" value={brToNewlines(r.power_points)} />
                  </dl>
                  {description && <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{description}</p>}
                  {augment && (
                    <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                      <span className="font-semibold text-gold">Augment: </span>
                      {augment}
                    </p>
                  )}
                  {mythic && (
                    <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                      <span className="font-semibold text-gold">Mythic: </span>
                      {mythic}
                    </p>
                  )}
                  {brToNewlines(r.special) && (
                    <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                      <span className="font-semibold text-foreground">Special: </span>
                      {brToNewlines(r.special)}
                    </p>
                  )}
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

function PowerDetailField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-foreground">{value}</dd>
    </>
  );
}
