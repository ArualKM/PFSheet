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
import { enabledThreeppSystems } from "@/lib/character/threepp";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow, PickerDivider, ThreeppSystemBadge } from "./picker-shell";
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

/** A threepp_feat_compendium row (3pp feats have no feat_prerequisite rows and no feat_effect seeds). */
type ThreeppFeatResult = {
  slug: string;
  name: string | null;
  type: string | null;
  system: string | null;
  prerequisites: string | null;
  benefit: string | null;
  normal: string | null;
  special: string | null;
  source: string | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// PostgREST `.or()` escaping — same semantics as compendium-browser.tsx: double-quote the value (escaping
// one level for the quoted string) and escape LIKE metacharacters inside the pattern.
const pgQuote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const likePattern = (v: string) => `%${v.replace(/\\/g, "\\\\").replace(/[%_]/g, (m) => `\\${m}`)}%`;

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
export function FeatPicker({
  ed,
  onClose,
  autoFocusSearch = true,
}: {
  ed: CharacterEditorApi;
  onClose: () => void;
  /** Suppress the search input's autofocus (the wizard steps opt out — entering a step must not pop
   * the mobile keyboard unprompted). Defaults to true so every existing call site is unaffected. */
  autoFocusSearch?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [feats, setFeats] = useState<FeatResult[]>([]);
  const [threepp, setThreepp] = useState<ThreeppFeatResult[]>([]);
  const [prereqs, setPrereqs] = useState<Record<string, CompendiumPrereq[]>>({});
  const [effects, setEffects] = useState<Record<string, CompendiumEffectSeed[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = usePrereqContext(ed);
  const added = useMemo(
    () => new Set(ed.draft.feats.list.map((f) => f.compendiumId).filter(Boolean) as string[]),
    [ed.draft.feats.list],
  );
  // 3pp gating (docs/3PP_MASTER_PLAN.md D1): third-party feats surface ONLY for enabled modules.
  // Keyed as a string so the search effect re-fires only on a real module toggle, not every draft edit.
  const threeppKey = useMemo(() => enabledThreeppSystems(ed.draft).join(","), [ed.draft]);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const systems = threeppKey ? threeppKey.split(",") : [];
    const timer = setTimeout(async () => {
      setLoading(true);
      // Gate BEFORE querying: with no enabled 3pp module, the union query never fires. The table is queried
      // directly (not the search RPC) so the system filter runs SERVER-SIDE — the mixed 860-row table is
      // mostly spheres/other rows, and an unfiltered 40-row window would starve small systems (psionic has
      // only 2 feats) before the client filter ever saw them. Search matches the 0026 RPC semantics:
      // name SUBSTRING or whole-word FTS.
      let tppQuery: PromiseLike<{ data: unknown; error: { message: string } | null }> | null = null;
      if (systems.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let tq = (supabase as any)
          .from("threepp_feat_compendium")
          .select("slug,name,type,system,prerequisites,benefit,normal,special,source")
          .in("system", systems)
          .order("name")
          .limit(40);
        if (term) tq = tq.or(`name.ilike.${pgQuote(likePattern(term))},search.wfts(english).${pgQuote(term)}`);
        tppQuery = tq;
      }
      const [core, tp] = await Promise.all([
        supabase.rpc("search_feat_compendium", { p_query: term, p_limit: 40 }),
        tppQuery ?? Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (core.error) {
        setError(core.error.message);
        setFeats([]);
        setThreepp([]);
        setLoading(false);
        return;
      }
      const rows = (core.data ?? []) as FeatResult[];
      setError(null);
      setFeats(rows);
      // The 3pp union fails soft — a third-party hiccup never blocks core picking. The client system
      // filter is belt-and-suspenders on top of the server-side `.in("system", …)`.
      const tpRows = tp && !tp.error ? ((tp.data ?? []) as ThreeppFeatResult[]) : [];
      setThreepp(tpRows.filter((r) => !!r.name && !!r.system && systems.includes(r.system)));
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
  }, [q, supabase, threeppKey]);

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

  // 3pp add — same FeatEntry shape, but `3pp:` prefixes the compendiumId so it never collides with a
  // core slug, and there are no effect seeds to pre-fill (automation stays empty).
  const addThreeppFeat = (r: ThreeppFeatResult) =>
    ed.update((c) => {
      const cid = `3pp:${r.slug}`;
      if (c.feats.list.some((f) => f.compendiumId === cid)) return;
      c.feats.list.push({
        id: newId("feat"),
        name: r.name ?? r.slug,
        type: r.type ?? undefined,
        compendiumId: cid,
        prerequisites: r.prerequisites ?? undefined,
        benefit: r.benefit ?? undefined,
        normal: r.normal ?? undefined,
        special: r.special ?? undefined,
        tags: [],
        automation: [],
      });
    });

  return (
    <PickerShell icon={<Swords />} title="Feat compendium" onClose={onClose}>
      <PickerSearch
        autoFocus={autoFocusSearch}
        value={q}
        onChange={setQ}
        loading={loading}
        label="Search the feat compendium"
        placeholder="Search feats by name, type, or benefit…"
      />
      <PickerError message={error} />
      <PickerList
        isEmpty={feats.length === 0 && threepp.length === 0 && !loading}
        hint={q.trim().length === 1 ? "Keep typing…" : "No feats found."}
      >
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
        {threepp.length > 0 && (
          <>
            <PickerDivider label="Third-party" />
            {threepp.map((r) => {
              const cid = `3pp:${r.slug}`;
              const isAdded = added.has(cid);
              // 3pp prereqs are free text (no feat_prerequisite rows) — rendered in the manual-check
              // chip style, split into per-requirement chips for scanability. Never auto-evaluated.
              const prereqBits = (r.prerequisites ?? "")
                .split(/[;,]\s*/)
                .map((s) => s.trim())
                .filter(Boolean);
              return (
                <PickerRow key={cid}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                      {r.type && <Badge variant="rune">{r.type}</Badge>}
                      <ThreeppSystemBadge system={r.system} />
                      {r.source && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{r.source}</span>}
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "ghost" : "secondary"}
                      disabled={isAdded}
                      onClick={() => addThreeppFeat(r)}
                      aria-label={`Add ${r.name ?? r.slug}`}
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
                  {prereqBits.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {prereqBits.map((p, pi) => (
                        <span
                          key={pi}
                          title={`${p} — third-party prerequisite; check manually`}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </PickerRow>
              );
            })}
          </>
        )}
      </PickerList>
    </PickerShell>
  );
}
