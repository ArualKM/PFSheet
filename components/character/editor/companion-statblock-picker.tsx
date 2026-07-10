"use client";

import { useEffect, useMemo, useState } from "react";
import { PawPrint, Search } from "lucide-react";
import type { CompanionType } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
import { applyCompanionStatblock, STATBLOCK_SOURCES, type CompanionCompendiumRow } from "@/lib/character/companion-statblock";
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow } from "./picker-shell";
import type { CharacterEditorApi } from "./use-character-editor";

/**
 * In-editor "Change statblock" picker for a companion sheet's Companion Link panel. The owner's
 * reported gap: the CREATE dialog (`<CompanionsCard>`) lets you pick a creature statblock, but once
 * the companion exists the editor's Identity zone only offers the PC race browser — the wrong tool,
 * since a creature companion's compendium statblock effectively IS its "race" (cohorts are the
 * exception; see the explainer text in `CompanionEditor`).
 *
 * Reuses the same debounced compendium-search RPC pattern as `<CompanionsCard>`'s inline search, but
 * applies via the shared `applyCompanionStatblock` (`lib/character/companion-statblock.ts`) so
 * re-picking a statblock on an ALREADY-CREATED companion gets identical autofill (ability scores/
 * size/speed/attacks, identity.race, and — for familiars — the parsed master benefit) to picking one
 * at creation time. Only rendered for types `STATBLOCK_SOURCES` actually backs (familiar/
 * animal_companion/mount); returns null otherwise so callers can mount it unconditionally.
 */
export function CompanionStatblockPicker({ ed, type }: { ed: CharacterEditorApi; type: CompanionType }) {
  const cfg = STATBLOCK_SOURCES[type];
  const comp = ed.draft.companion;
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CompanionCompendiumRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cfg) return;
    const term = q.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (term.length < 2) {
        if (!cancelled) {
          setRows([]);
          setError(null);
          setLoading(false); // an in-flight fetch may have been cancelled with the spinner on
        }
        return;
      }
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase as any).rpc(cfg.rpc, { p_query: term, p_limit: 8 });
      if (!cancelled) {
        setError(rpcError?.message ?? null);
        setRows(rpcError ? [] : ((data ?? []) as CompanionCompendiumRow[]));
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q, cfg, supabase]);

  if (!cfg || !comp) return null;

  // companion.statblockName records what was actually APPLIED — identity.race starts as a mirror of
  // it but is player-editable (a hand-typed race must not masquerade as the applied statblock;
  // review finding). Legacy sheets predating statblockName fall back to the slug.
  const currentName = comp.compendiumId ? comp.statblockName || comp.compendiumId : null;

  const pick = (row: CompanionCompendiumRow) => {
    ed.update((c) => applyCompanionStatblock(c, row, type));
    setOpen(false);
    setQ("");
    setRows([]);
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised p-3">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Statblock
          </span>
          {currentName ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <PawPrint className="size-3.5 shrink-0 text-gold" /> {currentName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              No statblock picked yet — this companion is a blank shell.
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Search className="size-4" /> {currentName ? "Change" : "Browse"}
        </Button>
        {currentName && (
          // Replacement semantics, stated up front: picking swaps the creature-derived attacks/
          // features (hand-edits to THOSE entries included) — everything else on the sheet stays.
          <span className="w-full text-[11px] text-muted-foreground">
            Picking a new statblock replaces the creature&rsquo;s derived attacks &amp; features;
            everything else you&rsquo;ve added stays.
          </span>
        )}
      </div>
    );
  }

  return (
    <PickerShell icon={<PawPrint />} title="Statblock" onClose={() => setOpen(false)}>
      <PickerSearch
        autoFocus={false}
        value={q}
        onChange={setQ}
        loading={loading}
        label="Search companion statblocks"
        placeholder={cfg.hint}
      />
      <PickerError message={error} />
      <PickerList
        isEmpty={rows.length === 0 && !loading}
        hint={q.trim().length < 2 ? "Keep typing…" : "No matches found."}
      >
        {rows.map((r) => (
          <PickerRow key={r.slug} onClick={() => pick(r)} ariaLabel={`Use ${r.name ?? r.slug}`}>
            <span className="text-sm font-medium text-foreground">{r.name ?? r.slug}</span>
          </PickerRow>
        ))}
      </PickerList>
    </PickerShell>
  );
}
