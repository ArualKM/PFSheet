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
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow, PickerDetail, StatChip } from "./picker-shell";
import type { CharacterEditorApi } from "./use-character-editor";

type ArchRow = { slug: string; name: string; class: string; source: string | null };

const esc = (s: string) => s.replace(/[%_\\]/g, "\\$&");

/**
 * Phase 5 — the archetype picker. Scoped to the character's classes; for a selected archetype it fetches the
 * features (to compute what it replaces) and BLOCKS apply when a feature is already replaced by another
 * archetype on the class (the conflict rule, explained inline). Apply runs applyArchetype (removes replaced
 * standard features + grants the archetype's features + records it on the class row).
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
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ArchRow | null>(null);
  const [features, setFeatures] = useState<ArchetypeFeatureRow[]>([]);
  const [report, setReport] = useState<ApplyArchetypeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classRow = ed.draft.identity.classes.find((c) => c.id === classId);
  const applied = useMemo(() => classRow?.archetypes ?? [], [classRow?.archetypes]);

  // Key the fetch on the stable class NAME (string), not the memo'd object — the editor clones its draft on
  // every edit, so `selectedClass` churns identity each apply/unrelated edit and would otherwise refetch.
  const className = selectedClass?.name;
  useEffect(() => {
    if (!className) return;
    let cancelled = false;
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
  }, [className, q, supabase]);

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
              <PickerList isEmpty={rows.length === 0 && !loading} emptyText="No archetypes found.">
                {rows.map((r) => (
                  <PickerRow key={r.slug} onClick={() => selectArch(r)} ariaLabel={`Open ${r.name}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                      {r.source && <span className="shrink-0 text-[11px] text-muted-foreground">{r.source.split(/ pg/)[0]}</span>}
                    </span>
                  </PickerRow>
                ))}
              </PickerList>
            </>
          ) : (
            <PickerDetail title={selected.name} onBack={() => setSelected(null)}>
              <PickerError message={error} />

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
            </PickerDetail>
          )}
        </>
      )}
    </PickerShell>
  );
}
