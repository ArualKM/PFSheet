"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X, CircleAlert, Check } from "lucide-react";
import {
  applyArchetype,
  archetypeReplaces,
  findArchetypeConflicts,
  type ArchetypeFeatureRow,
  type ApplyArchetypeResult,
} from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CharacterEditorApi } from "./use-character-editor";

type ArchRow = { slug: string; name: string; class: string; source: string | null };

const esc = (s: string) => s.replace(/[%_\\]/g, "\\$&");

/**
 * Phase 5 — the archetype picker. Scoped to the character's classes; for a selected archetype it fetches the
 * features (to compute what it replaces) and BLOCKS apply when a feature is already replaced by another
 * archetype on the class (the conflict rule, explained inline). Apply runs applyArchetype (removes replaced
 * standard features + grants the archetype's features + records it on the class row).
 */
export function ArchetypePicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const classes = useMemo(
    () => ed.draft.identity.classes.map((c) => ({ id: c.id, name: c.compendiumPreset?.name ?? c.name })).filter((c) => c.name),
    [ed.draft.identity.classes],
  );
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const selectedClass = classes.find((c) => c.id === classId);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ArchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ArchRow | null>(null);
  const [features, setFeatures] = useState<ArchetypeFeatureRow[]>([]);
  const [report, setReport] = useState<ApplyArchetypeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classRow = ed.draft.identity.classes.find((c) => c.id === classId);
  const applied = useMemo(() => classRow?.archetypes ?? [], [classRow?.archetypes]);

  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("archetype_compendium")
        .select("slug,name,class,source")
        .eq("class", selectedClass.name)
        .order("name")
        .limit(200);
      if (q.trim()) query = query.ilike("name", `%${esc(q.trim())}%`);
      const { data, error: e } = await query;
      if (cancelled) return;
      setError(e?.message ?? null);
      setRows((data ?? []) as ArchRow[]);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [selectedClass, q, supabase]);

  const selectArch = async (r: ArchRow) => {
    setSelected(r);
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
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> Archetypes
        </h4>
        <Button variant="ghost" size="icon" aria-label="Close archetypes" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {classes.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Add a class first to choose an archetype.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSelected(null);
              }}
              aria-label="Class"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {applied.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              Applied:
              {applied.map((a) => (
                <Badge key={a.compendiumId ?? a.name} variant="rune">
                  {a.name}
                </Badge>
              ))}
            </p>
          )}

          {error && <p className="mt-2 text-xs text-danger">{error}</p>}

          {!selected ? (
            <>
              <div className="relative mt-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search archetypes by name…"
                  aria-label="Search archetypes"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
                />
                {loading && (
                  <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
                {rows.length === 0 && !loading ? (
                  <li className="px-1 py-2 text-sm text-muted-foreground">No archetypes found.</li>
                ) : (
                  rows.map((r) => (
                    <li key={r.slug}>
                      <button
                        type="button"
                        onClick={() => selectArch(r)}
                        aria-label={`Open ${r.name}`}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left hover:border-rune/50"
                      >
                        <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                        {r.source && <span className="shrink-0 text-[11px] text-muted-foreground">{r.source.split(/ pg/)[0]}</span>}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <div className="mt-3 space-y-3 rounded-md border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{selected.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  ← Back
                </Button>
              </div>

              {replaces.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Replaces: <span className="capitalize text-foreground">{replaces.join(", ")}</span>
                </p>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
