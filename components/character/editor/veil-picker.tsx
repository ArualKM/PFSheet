"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check, ChevronDown, RefreshCw } from "lucide-react";
import { Meditation } from "@/components/ui/game-icons";
import { parseVeilSlots, type AkashicVeilRef } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
// brToNewlines is the shared "<br>"-rich-text normalizer (psionic-powers.ts hosts it for all 3pp pickers).
import { brToNewlines } from "@/lib/character/psionic-powers";
import { fetchAllRows } from "@/lib/character/fetch-all-rows";
import { rankVeils, veilSlotOptions, veilMatchesSlot } from "@/lib/character/akashic-veils";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow } from "./picker-shell";
import { cn } from "@/lib/utils";

/** The compendium columns the picker reads — all cached onto the sheet by addVeil except is_retold
 * (row-badge display only; ~395 metadata-only rows have an empty effect BY DESIGN). */
const VEIL_COLUMNS = "slug,name,slot,descriptors,effect,bind_effect,is_retold,source";

type VeilRowData = {
  slug: string;
  name: string | null;
  slot: string | null;
  descriptors: string | null;
  effect: string | null;
  bind_effect: string | null;
  is_retold: string | null;
  source: string | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const nameKey = (s: string) => s.trim().toLowerCase();
/** Cap rendered rows — the full table is 1,332 veils; filters narrow the rest. */
const SHOW_CAP = 200;

/** Module-scope cache: the picker unmounts on Close, but the full table (1,332 rows with rules
 * text) must not re-download on every Browse open in a normal add-close-reopen editing flow
 * (mobile-first standing rule). Populated once per page load. */
let browseCache: VeilRowData[] | null = null;

/** Per-class-list veil-name sets from the `akashic_veil_class_list` junction — fetched once per
 * list per page load ("shapeable by" filter). */
const classListCache = new Map<string, Set<string>>();

/** The 15 veil lists in the junction (verified against prod — the junction has no other values;
 * hardcoded so the filter needn't download 6,645 rows to learn them). */
const CLASS_LISTS = [
  "Daevic",
  "Eclipse",
  "Guru",
  "Helmsman",
  "Huay",
  "Kheshig",
  "Lunar",
  "Nexus",
  "Promethean",
  "Radiant",
  "Rajah",
  "Soulforge",
  "Stormbound",
  "Vizier",
  "Volur",
] as const;

const isRetold = (r: VeilRowData) => (r.is_retold ?? "").trim().toLowerCase() === "yes";

/**
 * Akashic veil picker (3PP Phase 5) — loads the full 1,332-row `akashic_veil_compendium` once
 * (module-scope cached across open/close), then EVERYTHING is client-side: the query ranks by
 * name-then-text over the whole table, so the slot / class-list / descriptor / version filters
 * always see every match. Adding caches the full compendium detail onto `akashic.veilsKnown`
 * (compendiumId `3pp:${slug}`) so the sheet + read view render without a DB round-trip.
 * Metadata-only rows (empty effect) render "Text in {source}" — never fake rules.
 */
export function VeilPicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseRows, setBrowseRows] = useState<VeilRowData[]>(() => browseCache ?? []);
  const [slotFilter, setSlotFilter] = useState("");
  const [classList, setClassList] = useState("");
  const [descriptorFilter, setDescriptorFilter] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [listLoading, setListLoading] = useState(false);
  // The selected list's veil-name set reads straight from the module cache at render; the fetch
  // effect below bumps this counter when it fills a missing list.
  const [, bumpListCache] = useState(0);
  const listNames = classList ? (classListCache.get(classList) ?? null) : null;
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  // Brief "Updated ✓" feedback after re-syncing an already-added veil from the compendium.
  const [updatedSlug, setUpdatedSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!updatedSlug) return;
    const t = setTimeout(() => setUpdatedSlug(null), 1600);
    return () => clearTimeout(t);
  }, [updatedSlug]);

  const added = useMemo(() => {
    const s = new Set<string>();
    for (const v of ed.draft.akashic?.veilsKnown ?? []) {
      if (v.compendiumId) s.add(v.compendiumId);
      s.add(`name:${nameKey(v.name)}`);
    }
    return s;
  }, [ed.draft.akashic?.veilsKnown]);
  const isAdded = (r: VeilRowData) => added.has(`3pp:${r.slug}`) || added.has(`name:${nameKey(r.name ?? r.slug)}`);

  // The whole table once (1,332 rows — module-cached, then every keystroke/filter is instant and
  // complete). PostgREST caps ONE response at 1,000 rows (a single `.limit(2000)` silently dropped
  // the 332 veils after "Swamp Creature's Flesh"), so the load pages via .range() until a short
  // page; `.order("slug")` is the unique tiebreaker that makes the page order total. Fails soft; a
  // retryable error message shows instead of rows.
  useEffect(() => {
    if (browseCache) return; // already loaded this page-load — state was seeded from the cache
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { rows: fetched, error: be } = await fetchAllRows<VeilRowData>((from, to) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("akashic_veil_compendium")
          .select(VEIL_COLUMNS)
          .order("name")
          .order("slug")
          .range(from, to),
      );
      if (cancelled) return;
      if (be) {
        setError(be.message);
        setBrowseRows([]);
      } else {
        const rows = fetched.filter((r) => !!r.name);
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

  // The selected class list's veil names (junction rows, one fetch per list per page load). Paged
  // like the main load — the largest list is 805 rows today, one data refresh away from the 1,000
  // PostgREST cap. Fails soft — a failed fetch leaves the list unfiltered rather than empty.
  useEffect(() => {
    if (!classList || classListCache.has(classList)) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      const { rows, error: le } = await fetchAllRows<{ veil: string | null }>((from, to) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("akashic_veil_class_list")
          .select("veil")
          .eq("veil_list", classList)
          .order("veil")
          .range(from, to),
      );
      if (cancelled) return;
      if (!le) {
        const names = new Set<string>(rows.map((r) => nameKey(r.veil ?? "")).filter(Boolean));
        classListCache.set(classList, names);
        bumpListCache((n) => n + 1);
      }
      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, classList]);

  const source = useMemo(() => rankVeils(browseRows, q), [browseRows, q]);

  // Slot options from the full browse list (all rows load anyway, so distinct-over-rows is
  // complete AND guaranteed to match the values the filter compares against).
  const slotOptions = useMemo(() => veilSlotOptions(browseRows.map((r) => r.slot)), [browseRows]);

  const visible = useMemo(() => {
    const dq = descriptorFilter.trim().toLowerCase();
    return source.filter((r) => {
      if (slotFilter && !veilMatchesSlot(parseVeilSlots(r.slot), slotFilter)) return false;
      if (versionFilter === "retold" && !isRetold(r)) return false;
      if (versionFilter === "original" && isRetold(r)) return false;
      if (dq && !(r.descriptors ?? "").toLowerCase().includes(dq)) return false;
      // The class-list set filters only once loaded — while it fetches, rows stay visible.
      if (classList && listNames && !listNames.has(nameKey(r.name ?? r.slug))) return false;
      return true;
    });
  }, [source, slotFilter, versionFilter, descriptorFilter, classList, listNames]);
  const shown = visible.slice(0, SHOW_CAP);

  const addVeil = (r: VeilRowData) =>
    ed.update((c) => {
      if (!c.akashic) c.akashic = { classes: [], veilsKnown: [], shaped: [], otherReceptacles: [], temporaryEssence: 0 };
      const cid = `3pp:${r.slug}`;
      const key = nameKey(r.name ?? r.slug);
      const slots = parseVeilSlots(r.slot);
      // Cached detail ("<br>" → newlines so the sheet stores plain text). undefined fields — and an
      // empty slots parse — are stripped before merging into an existing entry so a manual value is
      // never erased.
      const detail: Partial<AkashicVeilRef> = {
        name: r.name ?? r.slug,
        compendiumId: cid,
        slots: slots.length > 0 ? slots : undefined,
        descriptors: brToNewlines(r.descriptors),
        effect: brToNewlines(r.effect),
        bindEffect: brToNewlines(r.bind_effect),
        source: r.source?.trim() || undefined,
      };
      for (const k of Object.keys(detail) as (keyof AkashicVeilRef)[]) {
        if (detail[k] === undefined) delete detail[k];
      }
      const existing = c.akashic.veilsKnown.find((v) => v.compendiumId === cid || nameKey(v.name) === key);
      if (existing) {
        // Class-list provenance accumulates (a veil can be on several lists) — union, never replace.
        const mergedClassNames = classList
          ? [...new Set([...(existing.classNames ?? []), classList])]
          : existing.classNames;
        Object.assign(existing, detail);
        if (mergedClassNames && mergedClassNames.length > 0) existing.classNames = mergedClassNames;
      } else {
        c.akashic.veilsKnown.push({
          id: newId("veil"),
          name: r.name ?? r.slug,
          slots: [],
          ...(classList ? { classNames: [classList] } : {}),
          ...detail,
        });
      }
    });

  return (
    <PickerShell icon={<Meditation />} title="Veil compendium" onClose={onClose}>
      <PickerSearch
        autoFocus
        value={q}
        onChange={setQ}
        loading={loading || listLoading}
        label="Search veils"
        placeholder="Search veils by name or text…"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <select
          value={slotFilter}
          onChange={(e) => setSlotFilter(e.target.value)}
          aria-label="Filter by chakra slot"
          className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        >
          <option value="">All slots</option>
          {slotOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={classList}
          onChange={(e) => setClassList(e.target.value)}
          aria-label="Filter by class veil list"
          className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        >
          <option value="">Shapeable by…</option>
          {CLASS_LISTS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value)}
          aria-label="Filter by veil version"
          className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        >
          <option value="">All versions</option>
          <option value="original">Original</option>
          <option value="retold">Retold</option>
        </select>
        <input
          value={descriptorFilter}
          onChange={(e) => setDescriptorFilter(e.target.value)}
          aria-label="Filter by descriptor"
          placeholder="Descriptor…"
          className="h-11 w-28 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        />
      </div>

      <PickerError message={error} />
      <PickerList
        isEmpty={shown.length === 0 && !loading}
        hint="No veils found — try a different search or clear the filters."
      >
        {shown.map((r) => {
          const addedRow = isAdded(r);
          const open = openSlug === r.slug;
          const slots = parseVeilSlots(r.slot);
          const effect = brToNewlines(r.effect);
          const bindEffect = brToNewlines(r.bind_effect);
          const descriptors = brToNewlines(r.descriptors);
          const detailId = `veil-detail-${r.slug}`;
          const hasDetail = Boolean(effect || bindEffect || descriptors || r.source);
          return (
            <PickerRow key={r.slug}>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => hasDetail && setOpenSlug(open ? null : r.slug)}
                  aria-expanded={hasDetail ? open : undefined}
                  aria-controls={hasDetail ? detailId : undefined}
                  disabled={!hasDetail}
                  className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left disabled:cursor-default sm:min-h-9"
                >
                  {hasDetail ? (
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                  {slots.map((s) => (
                    <Badge key={s} variant="outline" className="shrink-0 text-[10px]">
                      {s}
                    </Badge>
                  ))}
                  {bindEffect && (
                    <Badge variant="gold" className="shrink-0 text-[10px]">
                      Bind
                    </Badge>
                  )}
                  {isRetold(r) && (
                    <Badge variant="rune" className="shrink-0 text-[10px]">
                      Retold
                    </Badge>
                  )}
                </button>
                {/* Already-added rows stay ENABLED as "Update": the merge branch in addVeil re-syncs
                    the cached compendium detail onto the existing entry (imported / manual veils gain
                    slots/effect/bind text; manual values are never erased). */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    addVeil(r);
                    if (addedRow) setUpdatedSlug(r.slug);
                  }}
                  aria-label={addedRow ? `Update ${r.name ?? r.slug} from the compendium` : `Add ${r.name ?? r.slug}`}
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
              <p className="mt-0.5 truncate pl-5 text-[11px] text-muted-foreground">
                {descriptors && <span>{descriptors.replace(/\n/g, ", ")} · </span>}
                {effect ? (
                  effect.replace(/\n/g, " ")
                ) : (
                  <span className="italic">Text in {r.source?.trim() || "the source book"}</span>
                )}
              </p>
              {open && hasDetail && (
                <div id={detailId} className="mt-1.5 border-t border-border/50 pt-1.5 text-xs">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <VeilDetailField label="Descriptors" value={descriptors} />
                    <VeilDetailField label="Effect" value={effect} />
                    <VeilDetailField label="Bind" value={bindEffect} />
                  </dl>
                  {!effect && (
                    <p className="mt-1.5 italic text-muted-foreground">
                      Rules text not included — see {r.source?.trim() || "the source book"}.
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

function VeilDetailField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-foreground">{value}</dd>
    </>
  );
}
