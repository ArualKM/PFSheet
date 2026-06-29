"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, X, Loader2 } from "lucide-react";
import { ABILITY_KEYS } from "@pathforge/schema";
import {
  evaluatePrerequisites,
  prereqSummary,
  type CompendiumPrereq,
  type PrereqContext,
} from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type FeatResult = {
  slug: string;
  name: string;
  types: string | null;
  source: string | null;
  prerequisites: string | null;
  benefit: string | null;
  normal: string | null;
  special: string | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Build the prerequisite-checking context from the live draft + the editor's cached computed values. */
function usePrereqContext(ed: CharacterEditorApi): PrereqContext {
  const computed = ed.computed;
  return useMemo(() => {
    const casterLevel = Math.max(0, ...computed.spellcasting.map((s) => s.casterLevel ?? 0));
    // Skill ranks keyed by paren-stripped name (the prereq parser strips "(alchemy)" etc.), taking the
    // best across specializations so "Craft 3 ranks" / "Craft (poison) 3 ranks" both resolve correctly.
    const skillRanks: Record<string, number> = {};
    for (const s of ed.draft.skills.list) {
      const total = (s.ranks ?? 0) + (s.backgroundRanks ?? 0);
      const base = s.label.toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
      skillRanks[base] = Math.max(skillRanks[base] ?? 0, total);
    }
    return {
      featNames: new Set([
        ...ed.draft.feats.list.map((f) => f.name.toLowerCase()),
        ...ed.draft.features.list.map((f) => f.name.toLowerCase()),
      ]),
      featureNames: new Set(ed.draft.features.list.map((f) => f.name.toLowerCase())),
      abilityScores: Object.fromEntries(ABILITY_KEYS.map((k) => [k, computed.abilities[k]?.effectiveScore ?? 10])),
      // bab.total is a number once the class system sets it (a hand-entered formula is the rare exception).
      bab: typeof ed.draft.combat.bab.total === "number" ? ed.draft.combat.bab.total : 0,
      totalLevel: ed.draft.identity.totalLevel ?? 0,
      casterLevel,
      skillRanks,
    };
  }, [ed.draft, computed]);
}

/**
 * Feat compendium picker — searches feat_compendium (ranked RPC), shows each feat's normalized
 * prerequisites as live met/unmet/manual chips evaluated against the character, and applies a pick to
 * character.feats. Prereqs are informational (never block — PF1e lets you note a feat; the chips warn).
 */
export function FeatPicker({ ed, onClose }: { ed: CharacterEditorApi; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [feats, setFeats] = useState<FeatResult[]>([]);
  const [prereqs, setPrereqs] = useState<Record<string, CompendiumPrereq[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = usePrereqContext(ed);
  const added = useMemo(
    () => new Set(ed.draft.feats.list.map((f) => f.compendiumId).filter(Boolean) as string[]),
    [ed.draft.feats.list],
  );

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error: rpcErr } = await supabase.rpc("search_feat_compendium", { p_query: term, p_limit: 40 });
      if (cancelled) return;
      if (rpcErr) {
        setError(rpcErr.message);
        setFeats([]);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as FeatResult[];
      setError(null);
      setFeats(rows);
      const names = rows.map((r) => r.name);
      if (names.length) {
        const { data: pr } = await supabase
          .from("feat_prerequisite")
          .select("feat,req_type,req_value")
          .in("feat", names);
        if (!cancelled) {
          const map: Record<string, CompendiumPrereq[]> = {};
          for (const p of (pr ?? []) as { feat: string; req_type: string; req_value: string }[]) {
            (map[p.feat] ??= []).push({ reqType: p.req_type, reqValue: p.req_value });
          }
          setPrereqs(map);
        }
      } else {
        setPrereqs({});
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, supabase]);

  const addFeat = (r: FeatResult) =>
    ed.update((c) => {
      if (c.feats.list.some((f) => f.compendiumId === r.slug)) return;
      c.feats.list.push({
        id: newId("feat"),
        name: r.name,
        type: r.types ?? undefined,
        compendiumId: r.slug,
        prerequisites: r.prerequisites ?? undefined,
        benefit: r.benefit ?? undefined,
        normal: r.normal ?? undefined,
        special: r.special ?? undefined,
        tags: [],
        automation: [],
      });
    });

  return (
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> Feat compendium
        </h4>
        <Button variant="ghost" size="icon" aria-label="Close feat compendium" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="relative">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search feats by name, type, or benefit…"
          aria-label="Search the feat compendium"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
        />
        {loading && (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-2 flex max-h-[65vh] flex-col gap-1 overflow-y-auto sm:max-h-96">
        {feats.length === 0 && !loading ? (
          <li className="px-1 py-2 text-sm text-muted-foreground">
            {q.trim().length === 1 ? "Keep typing…" : "No feats found."}
          </li>
        ) : (
          feats.map((r) => {
            const isAdded = added.has(r.slug);
            const checks = evaluatePrerequisites(prereqs[r.name] ?? [], ctx);
            const sum = prereqSummary(checks);
            return (
              <li key={r.slug} className="rounded-md border border-border/60 bg-background px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                    {r.types && <Badge variant="rune">{r.types}</Badge>}
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? "ghost" : "secondary"}
                    disabled={isAdded}
                    onClick={() => addFeat(r)}
                    aria-label={`Add ${r.name}`}
                    className="shrink-0"
                  >
                    {isAdded ? (
                      <>
                        <Check className="size-4" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" /> {sum.unmet > 0 ? "Add anyway" : "Add"}
                      </>
                    )}
                  </Button>
                </div>
                {checks.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {checks.map((c, ci) => (
                      // Requirement text stays `text-foreground` (high contrast on all 3 themes); the
                      // met/unmet/manual state is carried by the border tint + the coloured ✓/✗ glyph.
                      <span
                        key={ci}
                        title={c.note ? `${c.reqValue} — ${c.note}` : c.reqValue}
                        className={
                          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] text-foreground " +
                          (c.status === "met"
                            ? "border-success/50 bg-success/10"
                            : c.status === "unmet"
                              ? "border-gold/60 bg-gold/15"
                              : "border-border text-muted-foreground")
                        }
                      >
                        {c.status === "met" ? (
                          <span className="font-semibold text-success" aria-hidden>
                            ✓
                          </span>
                        ) : c.status === "unmet" ? (
                          <span className="font-semibold text-gold" aria-hidden>
                            ✗
                          </span>
                        ) : null}
                        {c.reqValue}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
