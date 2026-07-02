"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check, Zap, Swords } from "lucide-react";
import { ABILITY_KEYS, isModuleKeyEnabled } from "@pathforge/schema";
import {
  evaluatePrerequisites,
  prereqSummary,
  seedsToAutomationEffects,
  type CompendiumPrereq,
  type CompendiumEffectSeed,
  type PrereqContext,
} from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow } from "./picker-shell";
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
  /** The feat's mythic-version rules text (null when the feat has no mythic upgrade). */
  mythic: string | null;
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
      // The engine's effective BAB (master-linked familiars use the master's); the stored value
      // is the fallback for a hand-entered formula on a legacy computed blob.
      bab: computed.summary.bab ?? (typeof ed.draft.combat.bab.total === "number" ? ed.draft.combat.bab.total : 0),
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
  const [effects, setEffects] = useState<Record<string, CompendiumEffectSeed[]>>({});
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
        const [{ data: pr }, { data: fx }] = await Promise.all([
          supabase.from("feat_prerequisite").select("feat,req_type,req_value").in("feat", names),
          supabase.from("feat_effect").select("feat,target,op,value_or_formula,bonus_type,notes").in("feat", names),
        ]);
        if (!cancelled) {
          const map: Record<string, CompendiumPrereq[]> = {};
          for (const p of (pr ?? []) as { feat: string; req_type: string; req_value: string }[]) {
            (map[p.feat] ??= []).push({ reqType: p.req_type, reqValue: p.req_value });
          }
          setPrereqs(map);
          const emap: Record<string, CompendiumEffectSeed[]> = {};
          for (const e of (fx ?? []) as {
            feat: string;
            target: string;
            op: string;
            value_or_formula: string;
            bonus_type: string | null;
            notes: string | null;
          }[]) {
            (emap[e.feat] ??= []).push({
              target: e.target,
              op: e.op,
              valueOrFormula: e.value_or_formula,
              bonusType: e.bonus_type,
              notes: e.notes,
            });
          }
          setEffects(emap);
        }
      } else {
        setPrereqs({});
        setEffects({});
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
        // Carry the mythic-version text onto the sheet when the character is mythic, so the read
        // view can show the upgraded benefit alongside the base one.
        mythicBenefit: isModuleKeyEnabled(c, "mythic") ? (r.mythic ?? undefined) : undefined,
        tags: [],
        // Pre-fill engine effects from the compendium seed (Phase 3). Clean unconditional effects compute
        // immediately; choice/toggle/damage effects come in with a `condition` (recorded, not auto-applied).
        automation: seedsToAutomationEffects(effects[r.name] ?? [], r.slug),
      });
    });

  return (
    <PickerShell icon={<Swords />} title="Feat compendium" onClose={onClose}>
      <PickerSearch
        autoFocus
        value={q}
        onChange={setQ}
        loading={loading}
        label="Search the feat compendium"
        placeholder="Search feats by name, type, or benefit…"
      />
      <PickerError message={error} />
      <PickerList isEmpty={feats.length === 0 && !loading} hint={q.trim().length === 1 ? "Keep typing…" : "No feats found."}>
        {feats.map((r) => {
          const isAdded = added.has(r.slug);
          const checks = evaluatePrerequisites(prereqs[r.name] ?? [], ctx);
          const sum = prereqSummary(checks);
          return (
            <PickerRow key={r.slug}>
              <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                    {r.types && <Badge variant="rune">{r.types}</Badge>}
                    {r.mythic && (
                      <span
                        title="Has a mythic version — its upgraded benefit is saved with the feat on mythic characters"
                        className="inline-flex shrink-0 items-center rounded-full border border-gold/50 bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                      >
                        mythic
                      </span>
                    )}
                    {(effects[r.name]?.length ?? 0) > 0 && (
                      <span
                        title="Auto-fills this feat's mechanical effects on your sheet"
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-rune/40 bg-rune/10 px-1.5 py-0.5 text-[10px] text-foreground"
                      >
                        <Zap className="size-3 text-rune" aria-hidden /> auto
                      </span>
                    )}
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
            </PickerRow>
          );
        })}
      </PickerList>
    </PickerShell>
  );
}
