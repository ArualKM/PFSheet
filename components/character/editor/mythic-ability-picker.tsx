"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check } from "lucide-react";
import { Sparkles } from "@/components/ui/game-icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow, Segmented, FeatureTypeChip } from "./picker-shell";

export type MythicAbilityRow = {
  slug: string;
  path: string;
  name: string;
  type: string | null;
  source: string | null;
  description: string | null;
};

type Scope = "path" | "universal" | "all";

/**
 * Mythic path-ability picker — searches `search_mythic_path_ability_compendium` (431 abilities,
 * names recovered from AoN) with a scope filter: the character's chosen path, Universal
 * abilities, or everything. Client-side scope filtering on the ranked results, the same pattern
 * as the sphere picker's system scoping.
 */
export function MythicAbilityPicker({
  characterPath,
  addedNames,
  onAdd,
  onClose,
}: {
  /** The character's mythic path (lowercase, e.g. "archmage"; "none" hides the path scope). */
  characterPath: string;
  /** Lowercased names already on the sheet (matching picks show "Added"). */
  addedNames: Set<string>;
  onAdd: (row: MythicAbilityRow) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const hasPath = characterPath !== "none" && characterPath.length > 0;
  const pathLabel = hasPath ? characterPath[0]!.toUpperCase() + characterPath.slice(1) : "";
  const [scope, setScope] = useState<Scope>(hasPath ? "path" : "universal");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MythicAbilityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any).rpc("search_mythic_path_ability_compendium", {
        p_query: term,
        p_limit: 200,
      });
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setRows([]);
      } else {
        setError(null);
        setRows((data ?? []) as MythicAbilityRow[]);
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, supabase]);

  const scoped = rows.filter((r) => {
    const p = (r.path ?? "").toLowerCase();
    if (scope === "path") return p === characterPath;
    if (scope === "universal") return p === "universal";
    return true;
  });

  return (
    <PickerShell icon={<Sparkles />} title="Mythic abilities" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={scope}
          onChange={setScope}
          ariaLabel="Ability scope"
          options={[
            ...(hasPath ? [{ value: "path" as Scope, label: pathLabel }] : []),
            { value: "universal" as Scope, label: "Universal" },
            { value: "all" as Scope, label: "All paths" },
          ]}
        />
      </div>
      <PickerSearch autoFocus value={q} onChange={setQ} loading={loading} label="Search mythic abilities" placeholder="Search by name or rules text…" />
      <PickerError message={error} />
      <PickerList isEmpty={scoped.length === 0 && !loading} hint={q.trim().length === 1 ? "Keep typing…" : "No matches in this scope."}>
        {scoped.map((r) => {
          const isAdded = addedNames.has(r.name.toLowerCase());
          return (
            <PickerRow key={r.slug}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <span className="truncate">{r.name}</span>
                    <FeatureTypeChip type={r.type} />
                  </span>
                  <div className="text-[11px] text-muted-foreground">
                    {r.path}
                    {r.source ? ` · ${r.source}` : ""}
                  </div>
                  {r.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isAdded ? "ghost" : "secondary"}
                  disabled={isAdded}
                  onClick={() => onAdd(r)}
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
