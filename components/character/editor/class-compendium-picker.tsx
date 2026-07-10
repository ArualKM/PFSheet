"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, GraduationCap } from "lucide-react";
import {
  parseProgression,
  ABILITY_KEYS,
  type AbilityKey,
  type CasterType,
  type CompendiumClassInput,
  type HpMethod,
} from "@pathforge/schema";
import { applyCompendiumClass, type ApplyCompendiumClassResult, type CompendiumFeatureRow } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import {
  buildClassInput,
  buildFeatureRows,
  casterDefaults,
  parseHitDie,
  parseProgressionTable,
  type ClassCompendiumRow,
} from "@/lib/character/class-compendium";
import { enabledThreeppSystems } from "@/lib/character/threepp";
import {
  normalizeProgression,
  threeppClassRowToInput,
  threeppFeaturesFromProgression,
  type ThreeppClassRow,
} from "@/lib/character/threepp-class-adapter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "./fields";
import {
  PickerShell,
  PickerSearch,
  PickerError,
  PickerList,
  PickerRow,
  PickerDetail,
  PickerDivider,
  ThreeppSystemBadge,
  FeatureTypeChip,
  Segmented,
} from "./picker-shell";
import type { CharacterEditorApi } from "./use-character-editor";

const HP_METHODS: HpMethod[] = ["manual", "average", "max"];
const HP_LABELS: Record<HpMethod, string> = { manual: "Manual", average: "Average", max: "Max" };
const CASTER_TYPES: CasterType[] = ["prepared", "spontaneous", "spellbook"];

type ClassMode = "base" | "prestige";

const firstNum = (s: string) => s.match(/[+-]?\d+/)?.[0] ?? s;

/**
 * Phase 4 + polish — the progression-driven class builder, now covering BASE and PRESTIGE classes via one
 * Base/Prestige filter (prestige is just a compendium class applied with `suppressCaster`, so it shares this
 * whole UI instead of a separate button). Search the compendium, preview the parsed BAB/saves/caster, browse a
 * per-level PROGRESSION ACCORDION (each level's BAB/saves + the features gained, tagged Su/Ex/Sp; levels above
 * the chosen one dimmed), then apply via applyCompendiumClass.
 *
 * 3pp union (Phase 2b-B): with a 3pp module enabled, `threepp_class_compendium` rows for enabled systems list
 * under a "Third-party" divider (base/prestige follows the mode filter). Their `progression_json` comes in two
 * shapes (header-row 2D array like PFcore, or the Miraheze scraper's array-of-objects) — `normalizeProgression`
 * converts the latter, so the SAME parseProgression/accordion/applyCompendiumClass path applies them; the
 * adapter maps columns and synthesizes name-only feature grants from the "Special" column.
 */
export function ClassCompendiumPicker({
  ed,
  onClose,
  baseOnly,
  autoFocusSearch = true,
}: {
  ed: CharacterEditorApi;
  onClose: () => void;
  /** S6 Pillar 3 (wizard §4.3) — new players shouldn't see Prestige (it needs prerequisites they
   * don't have yet): hides the Base/Prestige Segmented and pins `mode` at "base". Additive/optional
   * — default undefined preserves today's Base+Prestige behavior everywhere else. */
  baseOnly?: boolean;
  /** Wizard §4.3 adversarial-review fix (finding A) — same optional autofocus escape hatch as
   * `RacePicker.autoFocusSearch`. Defaults to `true` so every existing call site (the editor's
   * Classes section) keeps today's autofocus-on-open behavior unchanged. */
  autoFocusSearch?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<ClassMode>("base");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ClassCompendiumRow[]>([]);
  const [tppRows, setTppRows] = useState<ThreeppClassRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ClassCompendiumRow | null>(null);
  /** Set alongside `selected` when the selection is a third-party row — apply runs through the 3pp adapter. */
  const [tppSelected, setTppSelected] = useState<ThreeppClassRow | null>(null);
  const [progression, setProgression] = useState<unknown>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseProgression> | null>(null);
  const [features, setFeatures] = useState<CompendiumFeatureRow[]>([]);
  const [level, setLevel] = useState(1);
  const [hpMethod, setHpMethod] = useState<HpMethod>("average");
  const [castingAbility, setCastingAbility] = useState<AbilityKey>("int");
  const [casterType, setCasterType] = useState<CasterType>("prepared");
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<ApplyCompendiumClassResult | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const isPrestige = mode === "prestige";

  // 3pp gating (docs/3PP_MASTER_PLAN.md D1): third-party classes surface ONLY for enabled modules.
  // Keyed as a string so the search effect re-fires only on a real module toggle, not every draft edit.
  const threeppKey = useMemo(() => enabledThreeppSystems(ed.draft).join(","), [ed.draft]);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    let cancelled = false;
    const rpc = isPrestige ? "search_prestige_class_compendium" : "search_class_compendium";
    const systems = threeppKey ? threeppKey.split(",") : [];
    const t = setTimeout(async () => {
      setLoading(true);
      // Gate BEFORE querying: with no enabled 3pp module, the union query never fires. p_limit covers the
      // whole 133-row table so browse-all still shows every row after the client system/type filter.
      const [core, tp] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc(rpc, { p_query: term, p_limit: 30 }),
        systems.length > 0
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).rpc("search_threepp_class_compendium", { p_query: term, p_limit: 200 })
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setError(core.error?.message ?? null);
      setRows((core.data ?? []) as ClassCompendiumRow[]);
      // The 3pp union fails soft — a third-party hiccup never blocks core picking. The RPC can't filter by
      // system/type, so both are applied client-side (enabled systems only; base vs prestige follows the mode).
      const wantedType = isPrestige ? "prestige" : "base";
      const tpRows = tp && !tp.error ? ((tp.data ?? []) as ThreeppClassRow[]) : [];
      setTppRows(tpRows.filter((r) => !!r.system && systems.includes(r.system) && (r.class_type ?? "base") === wantedType));
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, supabase, isPrestige, threeppKey]);

  const changeMode = (m: ClassMode) => {
    if (m === mode) return;
    setMode(m);
    setSelected(null);
    setTppSelected(null);
    setQ("");
    setRows([]);
    setTppRows([]);
    setError(null);
  };

  const select = async (row: ClassCompendiumRow) => {
    setSelected(row);
    setTppSelected(null);
    setReport(null);
    setParsed(null);
    setProgression(null);
    setFeatures([]);
    setExpanded(new Set());
    setQ("");

    // Prestige: only the progression table exists (no feature/effect tables) and casting is suppressed.
    if (isPrestige) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any).from("prestige_progression").select("json_data").eq("class", row.name).maybeSingle();
      if (e) {
        setError(e.message);
        return;
      }
      const prog = data?.json_data ?? null;
      setProgression(prog);
      const p = parseProgression(prog);
      if (!prog) p.warnings.push("No progression data for this prestige class — BAB/saves default to ¾/poor.");
      setParsed(p);
      return;
    }

    const [progRes, featRes, fxRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("class_progression").select("json_data").eq("class", row.name).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("class_feature_compendium").select("slug,feature,level,type,description").eq("class", row.name).eq("category", "Main"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("feature_effect").select("feature,target,op,value_or_formula,bonus_type,notes").eq("class", row.name),
    ]);
    if (progRes.error || featRes.error) {
      setError(progRes.error?.message ?? featRes.error?.message ?? "Could not load the class");
      return;
    }
    const prog = progRes.data?.json_data ?? null;
    setProgression(prog);
    const p = parseProgression(prog);
    if (!prog) p.warnings.push("No progression data for this class in the compendium — BAB/saves default to ¾/poor.");
    setParsed(p);
    setFeatures(buildFeatureRows(featRes.data ?? [], fxRes.data ?? []));
    const def = casterDefaults(row.name);
    setCastingAbility(def.castingAbility);
    setCasterType(def.casterType);
  };

  /** 3pp selection is fully synchronous — the search RPC already returned the whole row (progression included),
   * so unlike the PFcore path there is nothing left to fetch. The progression is normalized (object-format →
   * header-row) so the preview badges + accordion see the same shape apply does. Features are synthesized from
   * the progression's "Special" column (name-only grants; the 3pp tables have no per-feature rows). */
  const selectTpp = (row: ThreeppClassRow) => {
    setTppSelected(row);
    // Mirror the shared detail fields onto the ClassCompendiumRow shape the detail panel renders.
    setSelected({
      slug: `3pp:${row.slug}`,
      name: row.name ?? row.slug,
      hit_die: row.hit_die,
      class_skills: null,
      skill_points_per_level: row.skill_points,
      role: null,
      source: row.source,
    });
    setReport(null);
    setExpanded(new Set());
    setQ("");
    setError(null);
    const prog = normalizeProgression(row.progression_json ?? null) ?? null;
    setProgression(prog);
    const p = parseProgression(prog);
    // 4 real rows (Medic/Parasite/Rajah/Universal Servant) have no progression table. Apply still works via
    // the engine's parse fallback (½ BAB / poor saves) — replace the parser's own warning with the honest one.
    if (!prog) p.warnings = ["No progression table — BAB/saves default to ½/poor; features not auto-granted."];
    setParsed(p);
    setFeatures(threeppFeaturesFromProgression(prog, row.slug));
    const def = casterDefaults(row.name ?? row.slug);
    setCastingAbility(def.castingAbility);
    setCasterType(def.casterType);
  };

  const apply = () => {
    // A 3pp row with a null progression is still appliable (the parse fallback yields ½ BAB / poor saves);
    // the PFcore paths keep requiring a progression (no core row lacks one).
    if (!selected || (!progression && !tppSelected)) return;
    setApplying(true);
    let res: ApplyCompendiumClassResult | undefined;
    if (tppSelected) {
      // Same applyCompendiumClass path as PFcore, via the 3pp adapter. 3pp prestige classes advance an
      // existing pool/caster, so — like PFcore prestige — casting from spell-like columns is suppressed.
      const input = threeppClassRowToInput(tppSelected, { castingAbility, casterType });
      const suppress = (tppSelected.class_type ?? "base") === "prestige";
      ed.update((c) => {
        res = applyCompendiumClass(c, { input, level, hpMethod, features, suppressCaster: suppress });
      });
    } else if (isPrestige) {
      // A prestige class advances an existing caster ("+1 level of existing class"), so we suppress the spurious
      // new-caster the spell columns would create; the player raises their real caster's level manually.
      const input: CompendiumClassInput = {
        key: `pfcore-prestige:${selected.slug}`,
        name: selected.name,
        hitDie: parseHitDie(selected.hit_die),
        skillRanksPerLevel: 2,
        classSkillKeys: [],
        progression,
      };
      ed.update((c) => {
        res = applyCompendiumClass(c, { input, level, hpMethod, suppressCaster: true });
      });
    } else {
      const input = buildClassInput(selected, progression, { castingAbility, casterType });
      ed.update((c) => {
        res = applyCompendiumClass(c, { input, level, hpMethod, features });
      });
    }
    setReport(res ?? null);
    setApplying(false);
  };

  const table = useMemo(() => parseProgressionTable(progression), [progression]);
  const featuresByLevel = useMemo(() => {
    const m = new Map<number, CompendiumFeatureRow[]>();
    for (const f of features) m.set(f.level, [...(m.get(f.level) ?? []), f]);
    return m;
  }, [features]);
  const toggle = (lvl: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });

  return (
    <PickerShell icon={<GraduationCap />} title="Class compendium" onClose={onClose}>
      {!selected ? (
        <>
          {!baseOnly && (
            <div className="mb-2">
              <Segmented
                ariaLabel="Class type"
                value={mode}
                onChange={changeMode}
                options={[
                  { value: "base", label: "Base & core" },
                  { value: "prestige", label: "Prestige" },
                ]}
              />
            </div>
          )}
          <PickerSearch
            autoFocus={autoFocusSearch}
            value={q}
            onChange={setQ}
            loading={loading}
            label={isPrestige ? "Search prestige classes" : "Search the class compendium"}
            placeholder={
              isPrestige ? "Search prestige — e.g. Arcane Trickster, Duelist…" : "Search classes — e.g. Fighter, Oracle, Magus…"
            }
          />
          <PickerError message={error} />
          <PickerList
            isEmpty={rows.length === 0 && tppRows.length === 0 && !loading}
            hint={q.trim().length === 1 ? "Keep typing…" : isPrestige ? "No prestige classes found." : "No classes found."}
          >
            {rows.map((r) => (
              <PickerRow key={r.slug} onClick={() => select(r)} ariaLabel={`Select ${r.name}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.name}</span>
                  <span className="flex min-w-0 shrink items-center justify-end gap-1.5">
                    {r.hit_die && <Badge variant="gold">d{parseHitDie(r.hit_die)}</Badge>}
                    {r.role && (
                      <span className="hidden max-w-[14rem] truncate text-[11px] text-muted-foreground sm:inline-block">
                        {r.role.split(/[.,]/)[0]}
                      </span>
                    )}
                  </span>
                </span>
              </PickerRow>
            ))}
            {tppRows.length > 0 && (
              <>
                <PickerDivider label="Third-party" />
                {tppRows.map((r) => (
                  <PickerRow key={`3pp-${r.slug}`} onClick={() => selectTpp(r)} ariaLabel={`Select ${r.name ?? r.slug} (third-party)`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.name ?? r.slug}</span>
                      <span className="flex min-w-0 shrink items-center justify-end gap-1.5">
                        {r.hit_die && <Badge variant="gold">d{parseHitDie(r.hit_die)}</Badge>}
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
          {!parsed ? (
            <p className="text-xs text-muted-foreground">Loading progression…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="gold">d{parseHitDie(selected.hit_die)}</Badge>
                <Badge variant="outline">BAB {parsed.bab.replace("_", "-")}</Badge>
                <Badge variant="outline">Fort {parsed.saves.fortitude}</Badge>
                <Badge variant="outline">Ref {parsed.saves.reflex}</Badge>
                <Badge variant="outline">Will {parsed.saves.will}</Badge>
                {!isPrestige && parsed.caster && (
                  <Badge variant="rune">caster (CL {parsed.caster.clProgression.replace("_", "-")})</Badge>
                )}
                {tppSelected && <ThreeppSystemBadge system={tppSelected.system} />}
                {tppSelected?.source && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{tppSelected.source}</span>}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <NumberField label="Level" value={level} min={1} onChange={(v) => setLevel(Math.max(1, v))} />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Hit points</span>
                  <div className="flex gap-1.5" role="group" aria-label="Hit point method">
                    {HP_METHODS.map((m) => (
                      <Button key={m} size="sm" variant={hpMethod === m ? "default" : "outline"} aria-pressed={hpMethod === m} onClick={() => setHpMethod(m)}>
                        {HP_LABELS[m]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {isPrestige ? (
                parsed.caster && (
                  <p className="rounded-lg border border-rune/30 bg-rune/5 p-2 text-[11px] text-muted-foreground">
                    This prestige class advances an existing caster level — applied as BAB/saves/HP only; raise your
                    caster&apos;s level by your prestige levels manually.
                  </p>
                )
              ) : (
                parsed.caster && (
                  <div className="flex flex-wrap items-end gap-3 rounded-lg border border-rune/30 bg-rune/5 p-2">
                    <label className="text-xs">
                      <span className="mb-1 block font-medium text-muted-foreground">Casting ability</span>
                      <select value={castingAbility} onChange={(e) => setCastingAbility(e.target.value as AbilityKey)} aria-label="Casting ability" className="h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground sm:h-9">
                        {ABILITY_KEYS.map((a) => (
                          <option key={a} value={a}>
                            {a.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block font-medium text-muted-foreground">Caster type</span>
                      <select value={casterType} onChange={(e) => setCasterType(e.target.value as CasterType)} aria-label="Caster type" className="h-11 rounded-lg border border-border bg-background px-2 text-sm capitalize text-foreground sm:h-9">
                        {CASTER_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="w-full text-[11px] text-muted-foreground">
                      The dataset doesn&apos;t record the casting stat — confirm it (the default is often wrong for non-core classes).
                    </p>
                  </div>
                )
              )}

              {table.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Progression — levels above {level} are previewed
                  </p>
                  <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border/50 p-1.5">
                    {table.map((row) => {
                      const feats = featuresByLevel.get(row.level) ?? [];
                      const locked = row.level > level;
                      const open = expanded.has(row.level);
                      const hasFeats = feats.length > 0 || !!row.special;
                      return (
                        <li key={row.level} className={locked ? "opacity-45" : ""}>
                          <button
                            type="button"
                            onClick={() => hasFeats && toggle(row.level)}
                            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-surface-raised/40"
                          >
                            <span className="w-7 shrink-0 font-semibold tabular-nums text-foreground">L{row.level}</span>
                            <span className="shrink-0 text-muted-foreground">BAB {firstNum(row.bab)}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              F{row.fort} · R{row.ref} · W{row.will}
                            </span>
                            {hasFeats && (
                              <span className="ml-auto flex min-w-0 items-center gap-1">
                                {!open && (
                                  <span className="truncate text-[10px] text-muted-foreground">
                                    {feats.length > 0 ? feats.map((f) => f.feature).join(", ") : row.special}
                                  </span>
                                )}
                                <ChevronDown className={`size-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                              </span>
                            )}
                          </button>
                          {open && (
                            <div className="ml-9 space-y-0.5 pb-1.5">
                              {feats.length > 0
                                ? feats.map((f) => (
                                    <div key={f.id} className="flex items-center gap-1.5 text-[11px] text-foreground">
                                      <FeatureTypeChip type={f.type} /> {f.feature}
                                    </div>
                                  ))
                                : row.special && <p className="text-[11px] text-muted-foreground">{row.special}</p>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {isPrestige && (
                <p className="text-[11px] text-warning">Check you meet the entry requirements — they aren&apos;t auto-verified.</p>
              )}

              {parsed.warnings.length > 0 && (
                <ul className="ml-4 list-disc text-[11px] text-warning">
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}

              <Button size="sm" disabled={applying || (!progression && !tppSelected)} onClick={apply}>
                {applying ? <Loader2 className="size-4 animate-spin" /> : null}
                Apply {selected.name} {level}
              </Button>

              {report && (
                <div className="rounded-lg bg-surface-sunken p-2 text-[11px]">
                  <span className="font-medium text-foreground">Applied:</span>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {report.wrote.map((w, i) => (
                      <li key={`w${i}`}>{w}</li>
                    ))}
                    {report.featuresAdded.length > 0 && <li>Granted {report.featuresAdded.length} class features</li>}
                  </ul>
                  {report.warnings.length > 0 && (
                    <ul className="ml-4 mt-1 list-disc text-warning">
                      {report.warnings.map((w, i) => (
                        <li key={`warn${i}`}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </PickerDetail>
      )}
    </PickerShell>
  );
}
