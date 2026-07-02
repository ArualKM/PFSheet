"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Check, Shield } from "lucide-react";
import {
  applyArchetype,
  archetypeReplaces,
  findArchetypeConflicts,
  type ArchetypeFeatureRow,
  type ApplyArchetypeResult,
} from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { enabledThreeppSystems } from "@/lib/character/threepp";
import {
  baseClassParts,
  classNameForms,
  matchesBaseClass,
  threeppArchetypeFeatureRows,
  type ThreeppArchetypeRow,
} from "@/lib/character/threepp-class-adapter";
import { Button } from "@/components/ui/button";
import {
  PickerShell,
  PickerSearch,
  PickerError,
  PickerList,
  PickerRow,
  PickerDetail,
  PickerDivider,
  ThreeppSystemBadge,
  StatChip,
} from "./picker-shell";
import type { CharacterEditorApi } from "./use-character-editor";

type ArchRow = { slug: string; name: string; class: string; source: string | null };

const esc = (s: string) => s.replace(/[%_\\]/g, "\\$&");
// PostgREST `.or()` escaping — same semantics as compendium-browser.tsx.
const pgQuote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const likePattern = (v: string) => `%${v.replace(/\\/g, "\\\\").replace(/[%_]/g, (m) => `\\${m}`)}%`;

/**
 * Phase 5 — the archetype picker. Scoped to the character's classes; for a selected archetype it fetches the
 * features (to compute what it replaces) and BLOCKS apply when a feature is already replaced by another
 * archetype on the class (the conflict rule, explained inline). Apply runs applyArchetype (removes replaced
 * standard features + grants the archetype's features + records it on the class row).
 *
 * 3pp union (Phase 2b-B): when the character has a 3pp module enabled, `threepp_archetype_compendium` rows
 * whose `base_class` matches the target class are listed under a "Third-party" divider. The data has compound
 * values ("Barbarian<br>Unchained Barbarian", "Rogue/U. Rogue"), so the server fetch is a broad per-form
 * contains match and the REAL matching is client-side WHOLE-NAME comparison (`matchesBaseClass`) — a substring
 * match would offer Antipaladin archetypes to Paladins and "Radiant Retold" ones to Radiant, and miss every
 * unchained spelling. Those rows have no per-feature table, so apply runs on rows synthesized by the adapter:
 * the `altered_features` list drives replaces/conflicts and the prose description becomes the single granted
 * feature.
 */
export function ArchetypePicker({
  ed,
  onClose,
  lockedClassId,
}: {
  ed: CharacterEditorApi;
  onClose: () => void;
  /** When set, the picker is scoped to this class row (embedded inside it) — the class chooser is hidden. */
  lockedClassId?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const classes = useMemo(
    () => ed.draft.identity.classes.map((c) => ({ id: c.id, name: c.compendiumPreset?.name ?? c.name })).filter((c) => c.name),
    [ed.draft.identity.classes],
  );
  const [classId, setClassId] = useState(lockedClassId ?? classes[0]?.id ?? "");
  const selectedClass = classes.find((c) => c.id === classId);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ArchRow[]>([]);
  const [tppRows, setTppRows] = useState<ThreeppArchetypeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ArchRow | null>(null);
  /** Set alongside `selected` when the selection is a third-party row (adapter-synthesized features). */
  const [tppSelected, setTppSelected] = useState<ThreeppArchetypeRow | null>(null);
  const [features, setFeatures] = useState<ArchetypeFeatureRow[]>([]);
  const [report, setReport] = useState<ApplyArchetypeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classRow = ed.draft.identity.classes.find((c) => c.id === classId);
  const applied = useMemo(() => classRow?.archetypes ?? [], [classRow?.archetypes]);

  // 3pp gating (docs/3PP_MASTER_PLAN.md D1) — string-keyed so the effect re-fires only on a module toggle.
  const threeppKey = useMemo(() => enabledThreeppSystems(ed.draft).join(","), [ed.draft]);

  // Key the fetch on the stable class NAME (string), not the memo'd object — the editor clones its draft on
  // every edit, so `selectedClass` churns identity each apply/unrelated edit and would otherwise refetch.
  const className = selectedClass?.name;
  useEffect(() => {
    if (!className) return;
    let cancelled = false;
    const systems = threeppKey ? threeppKey.split(",") : [];
    const t = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("archetype_compendium")
        .select("slug,name,class,source")
        .eq("class", className)
        .order("name")
        .limit(200);
      if (q.trim()) query = query.ilike("name", `%${esc(q.trim())}%`);
      // Gate BEFORE querying: with no enabled 3pp module, the union query never fires. The server fetch is a
      // broad contains-match per class-name FORM (unchained spellings included) purely for performance — the
      // authoritative filter is the client-side whole-name `matchesBaseClass` below, which rejects the
      // substring collisions the broad fetch lets through (Antipaladin for Paladin, "Radiant Retold" for
      // Radiant, unchained-only rows for the core class).
      let tppQuery: PromiseLike<{ data: unknown; error: { message: string } | null }> | null = null;
      if (systems.length > 0) {
        const orExpr = [...classNameForms(className)]
          .map((f) => `base_class.ilike.${pgQuote(likePattern(f))}`)
          .join(",");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let tq = (supabase as any)
          .from("threepp_archetype_compendium")
          .select("slug,name,base_class,system,altered_features,description,source")
          .in("system", systems)
          .or(orExpr)
          .order("name")
          .limit(200);
        if (q.trim()) tq = tq.ilike("name", `%${esc(q.trim())}%`);
        tppQuery = tq;
      }
      const [core, tp] = await Promise.all([query, tppQuery ?? Promise.resolve(null)]);
      if (cancelled) return;
      setError(core.error?.message ?? null);
      setRows((core.data ?? []) as ArchRow[]);
      // The 3pp union fails soft — a third-party hiccup never blocks core picking.
      const tpRows = tp && !tp.error ? ((tp.data ?? []) as ThreeppArchetypeRow[]) : [];
      setTppRows(tpRows.filter((r) => matchesBaseClass(r.base_class, className)));
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [className, q, supabase, threeppKey]);

  const selectArch = async (r: ArchRow) => {
    setSelected(r);
    setTppSelected(null);
    setReport(null);
    setFeatures([]);
    if (!selectedClass) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (supabase as any)
      .from("archetype_feature_compendium")
      .select("slug,archetype,class,feature,type,level,replaces,text")
      .eq("class", selectedClass.name)
      .eq("archetype", r.name);
    if (e) {
      setError(e.message);
      return;
    }
    setFeatures((data ?? []) as ArchetypeFeatureRow[]);
  };

  /** 3pp selection is fully synchronous — there is no per-feature table; the adapter synthesizes the rows
   * `applyArchetype` needs from the `altered_features` list + the prose description. */
  const selectTpp = (r: ThreeppArchetypeRow) => {
    setTppSelected(r);
    setSelected({ slug: `3pp:${r.slug}`, name: r.name ?? r.slug, class: r.base_class ?? "", source: r.source });
    setReport(null);
    setError(null);
    setFeatures(threeppArchetypeFeatureRows(r));
  };

  const replaces = useMemo(() => archetypeReplaces(features), [features]);
  const conflicts = useMemo(() => findArchetypeConflicts(applied, replaces), [applied, replaces]);
  const alreadyApplied = !!selected && applied.some((a) => a.compendiumId === selected.slug);

  const apply = () => {
    if (!selected || !classId) return;
    let res: ApplyArchetypeResult | undefined;
    ed.update((c) => {
      res = applyArchetype(c, { classId, archetype: { name: selected.name, compendiumId: selected.slug }, features });
    });
    setReport(res ?? null);
  };

  return (
    <PickerShell icon={<Shield />} title="Archetypes" onClose={onClose}>
      {classes.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Add a class first to choose an archetype.</p>
      ) : (
        <>
          {!lockedClassId && (
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSelected(null);
              }}
              aria-label="Class"
              className="h-11 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground sm:h-9"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {applied.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              Applied:
              {applied.map((a) => (
                <StatChip key={a.compendiumId ?? a.name} tone="rune" value={a.name} />
              ))}
            </p>
          )}

          {!selected ? (
            <>
              <div className="mt-2">
                <PickerSearch value={q} onChange={setQ} loading={loading} label="Search archetypes" placeholder="Search archetypes by name…" />
              </div>
              <PickerError message={error} />
              <PickerList isEmpty={rows.length === 0 && tppRows.length === 0 && !loading} emptyText="No archetypes found.">
                {rows.map((r) => (
                  <PickerRow key={r.slug} onClick={() => selectArch(r)} ariaLabel={`Open ${r.name}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                      {r.source && <span className="shrink-0 text-[11px] text-muted-foreground">{r.source.split(/ pg/)[0]}</span>}
                    </span>
                  </PickerRow>
                ))}
                {tppRows.length > 0 && (
                  <>
                    <PickerDivider label="Third-party" />
                    {tppRows.map((r) => (
                      <PickerRow key={`3pp-${r.slug}`} onClick={() => selectTpp(r)} ariaLabel={`Open ${r.name ?? r.slug} (third-party)`}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{r.name ?? r.slug}</span>
                          <span className="flex min-w-0 shrink items-center justify-end gap-1.5">
                            {/* The matched base_class — multi-class rows (e.g. "Rogue, Unchained Rogue") stay explainable. */}
                            {r.base_class && (
                              <span className="hidden max-w-[12rem] truncate text-[11px] text-muted-foreground sm:inline-block">
                                {baseClassParts(r.base_class).join(", ")}
                              </span>
                            )}
                            <ThreeppSystemBadge system={r.system} />
                          </span>
                        </span>
                      </PickerRow>
                    ))}
                  </>
                )}
              </PickerList>
            </>
          ) : (
            <PickerDetail
              title={selected.name}
              onBack={() => {
                setSelected(null);
                setTppSelected(null);
              }}
            >
              <PickerError message={error} />

              {tppSelected && (
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ThreeppSystemBadge system={tppSelected.system} />
                  {tppSelected.base_class && (
                    <span className="min-w-0 truncate">
                      For: <span className="text-foreground">{baseClassParts(tppSelected.base_class).join(", ")}</span>
                    </span>
                  )}
                  {tppSelected.source && <span className="min-w-0 truncate">{tppSelected.source}</span>}
                </p>
              )}

              {replaces.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {/* 3pp data lists the features the archetype ALTERS (its own ability names) rather than a
                      strict replaces column — label honestly. */}
                  {tppSelected ? "Alters" : "Replaces"}:{" "}
                  <span className="capitalize text-foreground">{replaces.join(", ")}</span>
                </p>
              )}

              {tppSelected?.description && (
                // Scrollable prose must be keyboard-focusable (the V1·5 axe lesson).
                <div
                  tabIndex={0}
                  role="region"
                  aria-label={`${selected.name} description`}
                  className="max-h-44 overflow-y-auto whitespace-pre-line rounded-md border border-border/60 bg-background p-2 text-xs text-muted-foreground"
                >
                  {tppSelected.description.replace(/<br\s*\/?>/gi, "\n")}
                </div>
              )}

              {conflicts.length > 0 && (
                <p className="flex items-start gap-1.5 rounded border border-danger/40 bg-danger/10 p-2 text-[11px] text-foreground">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  <span>
                    Conflicts with an applied archetype over <span className="capitalize">{conflicts.join(", ")}</span> — two
                    archetypes can&apos;t both replace the same feature.
                  </span>
                </p>
              )}

              {alreadyApplied ? (
                <p className="flex items-center gap-1.5 text-[11px] text-success">
                  <Check className="size-4" /> Already applied to this class.
                </p>
              ) : (
                <Button size="sm" disabled={conflicts.length > 0 || features.length === 0} onClick={apply}>
                  Apply {selected.name}
                </Button>
              )}

              {report && (
                <div className="rounded bg-surface-sunken p-2 text-[11px] text-muted-foreground">
                  Replaced {report.replaced.length} standard feature{report.replaced.length === 1 ? "" : "s"}; granted{" "}
                  {report.added.length} archetype feature{report.added.length === 1 ? "" : "s"}.
                </div>
              )}
            </PickerDetail>
          )}
        </>
      )}
    </PickerShell>
  );
}
