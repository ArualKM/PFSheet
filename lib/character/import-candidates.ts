import {
  normalizeKey,
  strictKey,
  probeTables,
  type Candidate,
  type ClaimProbe,
  type ProbeCandidates,
} from "./import-claims";

/**
 * Server-side probe resolution for the import verification step. Two passes:
 *  1. EXACT — one batched `.in(labelCol, keys)` query per table for every probe key at once
 *     (source sheets usually type real entries with the book's capitalization, so this catches
 *     the bulk in ~11 queries total). Matches are classified per-probe by normalized name, and
 *     SAME-NAME rows are all kept (class_feature_compendium has 77 duplicated feature names —
 *     "Evasion" ×5 classes) so assembleClaims can tie-break or surface the selector.
 *  2. SEARCH — probes with no exact hit anywhere run their PRIMARY table's ranked search RPC
 *     (top 3) with the most-stripped key, in a small concurrency pool, capped so a 200-slot
 *     power sheet can't fire hundreds of RPCs. Mined probes search last (they're additive).
 *
 * A probe's table order comes from probeTables() — its header CONTEXT first ("CASTING TALENTS"
 * → sphere_talents), then its slot kind's tables.
 *
 * Failures never throw — verification is enrichment; a missing candidate set just means the
 * claim defaults to "keep as written".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

type TableCfg = {
  label: string;
  key: string;
  rpc?: string;
  select: string;
  meta: (r: Record<string, unknown>) => string | undefined;
  /** The owning group (class / sphere / race / path) for same-name tie-breaking. */
  group?: (r: Record<string, unknown>) => string | undefined;
};

const S = (v: unknown): string => (v == null ? "" : String(v));

const TABLES: Record<string, TableCfg> = {
  class_compendium: {
    label: "name",
    key: "slug",
    rpc: "search_class_compendium",
    select: "slug,name,hit_die,source",
    meta: (r) => [S(r.hit_die), S(r.source)].filter(Boolean).join(" · "),
  },
  archetype_compendium: {
    label: "name",
    key: "slug",
    rpc: "search_archetype_compendium",
    select: "slug,name,class,source",
    meta: (r) => [S(r.class), S(r.source)].filter(Boolean).join(" · "),
    group: (r) => S(r.class) || undefined,
  },
  race_compendium: {
    label: "name",
    key: "slug",
    rpc: "search_race_compendium",
    select: "slug,name,category,source",
    meta: (r) => [S(r.category), S(r.source)].filter(Boolean).join(" · "),
  },
  feat_compendium: {
    label: "name",
    key: "slug",
    rpc: "search_feat_compendium",
    select: "slug,name,types,source",
    meta: (r) => [S(r.types), S(r.source)].filter(Boolean).join(" · "),
  },
  trait_compendium: {
    label: "name",
    key: "slug",
    rpc: "search_trait_compendium",
    select: "slug,name,type,category,source",
    meta: (r) => [S(r.type) || S(r.category), S(r.source)].filter(Boolean).join(" · "),
  },
  drawback_compendium: {
    label: "name",
    key: "slug",
    rpc: "search_drawback_compendium",
    select: "slug,name,source",
    meta: (r) => S(r.source) || undefined,
  },
  class_feature_compendium: {
    label: "feature",
    key: "slug",
    rpc: "search_class_feature_compendium",
    select: "slug,feature,class,level,type",
    meta: (r) => [S(r.class), S(r.level) ? `L${S(r.level)}` : "", S(r.type)].filter(Boolean).join(" · "),
    group: (r) => S(r.class) || undefined,
  },
  spell_compendium: {
    label: "name",
    key: "id",
    // Its search RPC has a different signature (class filters) — the ilike fallback is enough here.
    select: "id,name,school,source",
    meta: (r) => [S(r.school), S(r.source)].filter(Boolean).join(" · "),
  },
  sphere_talents: {
    label: "talent_name",
    key: "id",
    // Its search RPC has a different signature too — ilike fallback.
    select: "id,talent_name,sphere_name,talent_category",
    meta: (r) => [S(r.sphere_name), S(r.talent_category)].filter(Boolean).join(" · "),
    group: (r) => S(r.sphere_name) || undefined,
  },
  mythic_path_ability_compendium: {
    label: "name",
    key: "slug",
    rpc: "search_mythic_path_ability_compendium",
    select: "slug,name,path,type,source",
    meta: (r) => [S(r.path), S(r.type) || S(r.source)].filter(Boolean).join(" · "),
    group: (r) => S(r.path) || undefined,
  },
  alternate_racial_trait_compendium: {
    label: "trait_name",
    key: "slug",
    rpc: "search_alternate_racial_trait_compendium",
    select: "slug,trait_name,race,source",
    meta: (r) => [S(r.race), S(r.source)].filter(Boolean).join(" · "),
    group: (r) => S(r.race) || undefined,
  },
};

function rowToCandidate(table: string, cfg: TableCfg, row: Record<string, unknown>, match: Candidate["match"]): Candidate {
  return {
    table,
    slug: S(row[cfg.key]),
    name: S(row[cfg.label]),
    meta: cfg.meta(row) || undefined,
    group: cfg.group?.(row),
    match,
  };
}

const SEARCH_CAP = 80;
const CONCURRENCY = 8;
/** Keys per .in() batch — keeps the GET URL far from any proxy's length limit. */
const IN_CHUNK = 120;

export async function resolveProbeCandidates(sb: Sb, probes: ClaimProbe[]): Promise<ProbeCandidates> {
  const out: ProbeCandidates = {};
  for (const p of probes) out[p.id] = [];

  // ── Pass 1: batched exact matches per table ─────────────────────────────────
  const keysByTable = new Map<string, Set<string>>();
  for (const probe of probes) {
    for (const table of probeTables(probe)) {
      const set = keysByTable.get(table) ?? new Set<string>();
      // postgrest-js can't serialize an embedded double-quote inside .in() values (the whole
      // filter 400s and the entire table batch silently returns null) — such keys fall through
      // to the parameterized search pass instead.
      probe.keys.forEach((k) => {
        if (!k.includes('"') && !k.includes("”") && !k.includes("“")) set.add(k);
      });
      keysByTable.set(table, set);
    }
  }

  const exactRows = new Map<string, Map<string, Candidate[]>>(); // table → normalized name → ALL candidates
  await Promise.all(
    [...keysByTable.entries()].map(async ([table, keys]) => {
      const cfg = TABLES[table];
      if (!cfg || keys.size === 0) return;
      const byName = new Map<string, Candidate[]>();
      const all = [...keys];
      for (let i = 0; i < all.length; i += IN_CHUNK) {
        try {
          const { data, error } = await sb
            .from(table)
            .select(cfg.select)
            .in(cfg.label, all.slice(i, i + IN_CHUNK))
            .limit(400);
          if (error) {
            // supabase-js reports PostgREST failures via `error`, not a throw — a silent empty
            // result here would quietly disable exact matching for every probe on this table.
            console.warn(`import verify: exact batch failed for ${table}: ${error.message}`);
            continue;
          }
          for (const row of (data ?? []) as Record<string, unknown>[]) {
            const k = normalizeKey(S(row[cfg.label]));
            const list = byName.get(k) ?? [];
            list.push(rowToCandidate(table, cfg, row, "exact"));
            byName.set(k, list);
          }
        } catch {
          // enrichment only
        }
      }
      exactRows.set(table, byName);
    }),
  );

  const needSearch: ClaimProbe[] = [];
  for (const probe of probes) {
    let found = false;
    for (const table of probeTables(probe)) {
      const byName = exactRows.get(table);
      if (!byName) continue;
      for (const key of probe.keys) {
        const hits = byName.get(normalizeKey(key)) ?? [];
        // A folded key can match DISTINCT rows that differ only by hyphenation — when the typed
        // punctuation matches one of them exactly, that row wins alone.
        const strict = hits.filter((h) => strictKey(h.name) === strictKey(key));
        for (const hit of strict.length ? strict : hits) {
          if (!out[probe.id]!.some((c) => c.table === hit.table && c.slug === hit.slug)) {
            out[probe.id]!.push(hit);
            found = true;
          }
        }
      }
    }
    if (!found) needSearch.push(probe);
  }

  // ── Pass 2: ranked-search fallback (primary table only, capped + pooled) ───
  // Priority under the cap: parsed slots, then multi-entry LINE ITEMS, then mined notes lines.
  const queue = [
    ...needSearch.filter((p) => !p.mined),
    ...needSearch.filter((p) => p.mined && p.partOf),
    ...needSearch.filter((p) => p.mined && !p.partOf),
  ].slice(0, SEARCH_CAP);
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const probe = queue[idx++]!;
      const table = probeTables(probe)[0]!;
      const cfg = TABLES[table];
      if (!cfg) continue;
      const q = probe.keys[probe.keys.length - 1] ?? probe.sourceText;
      try {
        let rows: Record<string, unknown>[] = [];
        if (cfg.rpc) {
          const { data } = await sb.rpc(cfg.rpc, { p_query: q, p_limit: 3 });
          rows = (data ?? []) as Record<string, unknown>[];
        } else {
          const esc = q.replace(/([%_\\])/g, "\\$1");
          const { data } = await sb.from(table).select(cfg.select).ilike(cfg.label, `%${esc}%`).limit(3);
          rows = (data ?? []) as Record<string, unknown>[];
        }
        // A ranked search can still surface the true row under different casing/punctuation —
        // promote it to exact so the claim auto-links. Punctuation-faithful (strict) equality
        // wins alone; hyphen-folded equality promotes only when no strict match exists, so the
        // three real hyphen-sibling trait pairs don't degrade a correct link to an ambiguity.
        const promoteExacts = (cands: Candidate[]): boolean => {
          const strict = cands.filter((c) => probe.keys.some((k) => strictKey(k) === strictKey(c.name)));
          const targets = strict.length
            ? strict
            : cands.filter((c) => probe.keys.some((k) => normalizeKey(k) === normalizeKey(c.name)));
          for (const t of targets) t.match = "exact";
          return targets.length > 0;
        };
        const searchCands = rows.slice(0, 3).map((row) => rowToCandidate(table, cfg, row, "search"));
        const promoted = promoteExacts(searchCands);
        out[probe.id]!.push(...searchCands);
        // Punctuation-insensitive rescue: "Two Weapon Fighting" is the book's "Two-Weapon
        // Fighting", but neither the literal exact pass nor the ranked search surfaces it (the
        // FTS tier ranks text-mention matches above the true row). Probe the primary table with
        // the name's words joined by wildcards — exact-modulo-separators — and promote only on
        // normalized equality, so "Greater Two-Weapon Fighting" can't slip in as exact.
        if (!promoted) {
          const norm = normalizeKey(q);
          if (norm.includes(" ")) {
            const pattern = norm
              .split(" ")
              .map((w) => w.replace(/([%_\\])/g, "\\$1"))
              .join("%");
            const { data } = await sb.from(table).select(cfg.select).ilike(cfg.label, pattern).limit(4);
            const rescueCands = ((data ?? []) as Record<string, unknown>[])
              .slice(0, 4)
              .map((row) => rowToCandidate(table, cfg, row, "search"))
              .filter((cand) => !out[probe.id]!.some((c) => c.table === cand.table && c.slug === cand.slug));
            promoteExacts(rescueCands);
            out[probe.id]!.push(...rescueCands);
          }
        }
      } catch {
        // enrichment only
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return out;
}
