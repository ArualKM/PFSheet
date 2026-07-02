#!/usr/bin/env node
// 3pp compendium loader — config-driven, adapted from PFcore Update/csv/loader/pfcore.mjs. ONE source of
// truth for both the Supabase DDL and the bulk TSV load, so the 18 tables stay consistent (compendium
// contract: public read · service write · tsvector search · search RPC · GIN). Reproducible + idempotent
// (upsert on slug; junctions upsert on their composite key). No secrets are hardcoded — the service key
// is read from ../../../../.env.local at runtime.
//
//   node threepp.mjs ddl              → print the table DDL (RLS + policies + indexes; apply via Supabase)
//   node threepp.mjs rpc              → print the search RPCs (migration-0026 prefix/substring pattern)
//   node threepp.mjs grants           → print explicit grants (RPC execute + table SELECT)
//   node threepp.mjs load [table]     → bulk-load all TSVs (or one table) into Supabase via the service role
//   node threepp.mjs counts           → print row counts the loader sees per table (missing files warned)
//   node threepp.mjs parse            → dry-run validation: column-count constancy, header coverage,
//                                       jsonb parse, junction-key dupes, slug collisions (no DB)
//
// TSV convention (Spheres standard): tab-delimited, one physical line per record, internal breaks as <br>
// (kept literal in the DB — decode at render time), no stray \t\r\n in cells — so split('\n') / split('\t')
// is safe. Search RPCs follow supabase/migrations/0026_pfcore_search_prefix.sql exactly: escape CTE +
// ILIKE substring WHERE (plus websearch FTS OR for multi-word) + ORDER BY exact > prefix > substring >
// ts_rank; signature search_<table>(p_query text default '', p_limit int default 60).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(HERE, "..");            // the csv/ folder (TSVs live here)
const REPO = resolve(HERE, "..", "..", "..", ".."); // repo root (.env.local + node_modules)

/** Each table: `cols` = table column order (source + url on every table — junctions carry them as
 *  null-loaded provenance columns so the compendium contract holds); `files` = one or more TSVs merged
 *  into the table — a string, or { file, map: {tsvCol: tableCol}, constants: {tableCol: value} } for
 *  per-file renames / injected values (e.g. drawbacks vs flaws → one unified table with a `category`);
 *  `search` = cols folded into the tsvector; `order` = the label column (ranked + default sort — must
 *  exist); `slug` = parts of the stable id ('#' → append row index; blank parts are skipped) — junctions
 *  have NO slug, they declare a composite `pk` instead; `indexes` = extra btree indexes (junction
 *  parent/join cols + child-table parents); `json` = cols typed jsonb; `browsable` adds the search
 *  vector + RPC (browsable table names MUST end in _compendium for the compendium_distinct RPC). */
const TABLES = [
  // ── psionics ──
  { table: "psionic_power_compendium", files: ["psionic_powers.tsv"],
    cols: ["name","discipline","descriptors","display","manifesting_time","range","target_area_effect","duration","saving_throw","power_resistance","power_points","description","augment","special","mythic","source","url"],
    search: ["name","description","augment"], order: "name", slug: ["name"], browsable: true },
  { table: "psionic_power_class_level",
    files: [{ file: "psionic_power_class_levels.tsv", constants: { source: null, url: null } }],
    cols: ["power","class","level","source","url"], pk: ["power","class"], indexes: ["power","class"], browsable: false },
  // ── path of war ──
  { table: "pow_discipline_compendium", files: ["pow_disciplines.tsv"],
    cols: ["name","associated_skill","associated_weapon_groups","martial_tradition","title_veil","dao_veil","description","source","url"],
    search: ["name","description"], order: "name", slug: ["name"], browsable: true },
  { table: "pow_maneuver_compendium", files: ["pow_maneuvers.tsv"],
    cols: ["name","discipline","level","category","type","descriptor","initiation_action","range","target","duration","saving_throw","prerequisite","description","source","url"],
    search: ["name","description"], order: "name", slug: ["name","discipline"], indexes: ["discipline"], browsable: true },
  // ── akashic ──
  { table: "akashic_veil_compendium", files: ["akashic_veils.tsv"],
    cols: ["name","slot","descriptors","effect","bind_effect","is_retold","source","url"],
    search: ["name","effect","bind_effect"], order: "name", slug: ["name"], browsable: true },
  { table: "akashic_veil_class_list",
    files: [{ file: "veil_class_lists.tsv", constants: { source: null, url: null } }],
    cols: ["veil","veil_list","source","url"], pk: ["veil","veil_list"], indexes: ["veil","veil_list"], browsable: false },
  // ── feats (two source files → ONE table; both carry `system`, rows tagged as-is) ──
  { table: "threepp_feat_compendium", files: ["metzofitz_feats.tsv", "spheres_feats.tsv"],
    cols: ["name","type","system","prerequisites","benefit","normal","special","source","url"],
    search: ["name","type","system","benefit","prerequisites"], order: "name", slug: ["name","system"], browsable: true },
  // ── classes / archetypes / class options ──
  { table: "threepp_class_compendium", files: ["threepp_classes.tsv"],
    cols: ["name","class_type","system","alignment","hit_die","skill_points","bab","fort","ref","will","class_features","progression_json","description","source","url"],
    json: ["progression_json"], search: ["name","system","description"], order: "name", slug: ["name","system"], browsable: true },
  { table: "threepp_archetype_compendium", files: ["threepp_archetypes.tsv"],
    cols: ["name","base_class","system","altered_features","description","source","url"],
    search: ["name","base_class","system","description"], order: "name", slug: ["name","base_class"], indexes: ["base_class"], browsable: true },
  { table: "threepp_class_option_compendium", files: ["spheres_class_options.tsv"],
    cols: ["name","base_class","system","option_type","description","source","url"],
    search: ["name","base_class","option_type","description"], order: "name", slug: ["base_class","option_type","name"], indexes: ["base_class"], browsable: true },
  // ── oaths ──
  { table: "oath_compendium", files: ["oaths.tsv"],
    cols: ["name","oath_points","oath","defiance_penalty","atonement","source","url"],
    search: ["name","oath","atonement"], order: "name", slug: ["name"], browsable: true },
  { table: "oath_boon_compendium", files: ["oath_boons.tsv"],
    cols: ["name","oath_point_cost","type","description","source","url"],
    search: ["name","type","description"], order: "name", slug: ["name"], browsable: true },
  // ── drawbacks + flaws (two source files → ONE unified table with a load-time `category`) ──
  { table: "threepp_drawback_compendium",
    files: [
      { file: "major_drawbacks.tsv", constants: { category: "major_drawback", prerequisite: null } },
      { file: "flaws.tsv", map: { drawback_effect: "effect" }, constants: { category: "flaw", bonus_granted: null } },
    ],
    cols: ["name","category","effect","bonus_granted","prerequisite","description","source","url"],
    search: ["name","category","effect","description"], order: "name", slug: ["name","category"], browsable: true },
  // ── backgrounds / occupations ──
  { table: "background_compendium", files: ["backgrounds.tsv"],
    cols: ["name","type","description","source","url"],
    search: ["name","type","description"], order: "name", slug: ["name"], browsable: true },
  { table: "occupation_compendium", files: ["occupations.tsv"],
    cols: ["name","class_skills_or_benefit","granted_feat","description","source","url"],
    search: ["name","class_skills_or_benefit","granted_feat","description"], order: "name", slug: ["name"], browsable: true },
  // ── future sets (TSVs may not exist yet — configured regardless; load/parse skip with a warning) ──
  { table: "threepp_race_compendium", files: ["threepp_races.tsv"],
    cols: ["name","system","ability_modifiers","size","speed","racial_traits","description","source","url"],
    search: ["name","system","racial_traits","description"], order: "name", slug: ["name","system"], browsable: true },
  { table: "threepp_racial_trait_compendium", files: ["threepp_racial_traits.tsv"],
    cols: ["name","race","system","replaces","description","source","url"],
    search: ["name","race","description"], order: "name", slug: ["race","name"], indexes: ["race"], browsable: true },
  { table: "threepp_trait_compendium", files: ["threepp_traits.tsv"],
    cols: ["name","type","system","description","source","url"],
    search: ["name","type","system","description"], order: "name", slug: ["name","type"], browsable: true },
];

const slugify = (s) =>
  String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "x";

const filesFor = (def) => def.files.map((f) => (typeof f === "string" ? { file: f } : f));

function parseTsv(file) {
  const text = readFileSync(resolve(CSV, file), "utf8").replace(/\r/g, "");
  const lines = text.split("\n").filter((l) => l.length > 0);
  const header = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

/** Build the table rows across all of a def's files (mapping + constants applied, slug/pk resolved).
 *  Missing files are skipped with a warning (unless quiet). Junction rows deduped on the composite pk. */
function rowsFor(def, { quiet = false } = {}) {
  const seen = new Map();       // slug collision guard
  const pkSeen = new Set();     // junction composite-key dedup
  const out = [];
  let i = 0;                    // global row index across files (stable — TSVs are versioned)
  for (const spec of filesFor(def)) {
    if (!existsSync(resolve(CSV, spec.file))) {
      if (!quiet) console.warn(`! ${def.table}: ${spec.file} not found — skipped`);
      continue;
    }
    const inv = Object.fromEntries(Object.entries(spec.map ?? {}).map(([tsv, col]) => [col, tsv]));
    for (const r of parseTsv(spec.file)) {
      const row = def.slug ? { slug: "" } : {};
      for (const c of def.cols) {
        let v;
        if (spec.constants && c in spec.constants) v = spec.constants[c];
        else v = r[inv[c] ?? c] ?? "";
        if (def.json?.includes(c)) {
          try { v = v ? JSON.parse(v) : null; } catch { v = null; }
        } else {
          v = v === "" ? null : v;
        }
        row[c] = v;
      }
      if (def.slug) {
        let base = def.slug.filter((p) => p !== "#")
          .map((p) => String(row[p] ?? "").trim()).filter(Boolean).map(slugify).join("-") || "x";
        if (def.slug.includes("#")) base = `${base}-${i}`;
        // guard against any residual collision
        const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
        row.slug = n > 1 ? `${base}-${n}` : base;
      }
      if (def.pk) {
        const key = def.pk.map((c) => row[c] ?? "").join(" ");
        if (pkSeen.has(key)) {
          if (!quiet) console.warn(`! ${def.table}: duplicate (${def.pk.join(",")}) dropped: ${key.replace(/ /g, " · ")}`);
          i++; continue;
        }
        pkSeen.add(key);
      }
      out.push(row); i++;
    }
  }
  return out;
}

// ───────────────────────────── DDL ─────────────────────────────
// Ranked search RPC — the migration-0026 pattern (0026_pfcore_search_prefix.sql): escape LIKE
// metacharacters, substring-match the label column (prefix typing works), keep tsvector FTS as an
// OR-branch for multi-word/description queries, rank exact > prefix > substring > ts_rank.
function rpcFor(def) {
  const label = `t."${def.order}"`;
  return (
    `create or replace function public.search_${def.table}(p_query text default '', p_limit int default 60)\n` +
    `returns setof public.${def.table} language sql stable set search_path = public as $func$\n` +
    `  with q as (\n` +
    `    select replace(replace(replace(coalesce(p_query, ''), '\\', '\\\\'), '%', '\\%'), '_', '\\_') as esc\n` +
    `  )\n` +
    `  select t.* from public.${def.table} t, q\n` +
    `  where coalesce(p_query, '') = ''\n` +
    `     or ${label} ilike '%' || q.esc || '%'\n` +
    `     or t.search @@ websearch_to_tsquery('english', p_query)\n` +
    `  order by\n` +
    `    case\n` +
    `      when coalesce(p_query, '') = '' then 3\n` +
    `      when lower(${label}) = lower(p_query) then 0\n` +
    `      when ${label} ilike q.esc || '%' then 1\n` +
    `      when ${label} ilike '%' || q.esc || '%' then 2\n` +
    `      else 3\n` +
    `    end,\n` +
    `    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,\n` +
    `    ${label}\n` +
    `  limit greatest(1, least(p_limit, 200));\n` +
    `$func$;\n`
  );
}

function ddlFor(def) {
  // Always double-quote column identifiers — some TSV headers collide with reserved words
  // (e.g. `type`, `range`, `target`, `class`, `level`).
  const colSql = def.cols
    .map((c) => `  "${c}" ${def.json?.includes(c) ? "jsonb" : "text"}`)
    .join(",\n");
  const pkSql = def.slug
    ? "  slug text primary key,\n"
    : "";
  const pkConstraint = def.pk ? `,\n  primary key (${def.pk.map((c) => `"${c}"`).join(", ")})` : "";
  const searchSql = def.browsable
    ? `,\n  search tsvector generated always as (to_tsvector('english', ${def.search
        .map((c) => `coalesce("${c}",'')`)
        .join(" || ' ' || ")})) stored`
    : "";
  let out = `create table if not exists public.${def.table} (\n${pkSql}${colSql}${searchSql}${pkConstraint}\n);\n`;
  if (def.browsable) out += `create index if not exists ${def.table}_search_idx on public.${def.table} using gin (search);\n`;
  for (const c of def.indexes ?? [])
    out += `create index if not exists ${def.table}_${c}_idx on public.${def.table} ("${c}");\n`;
  out += `alter table public.${def.table} enable row level security;\n`;
  out += `create policy "${def.table}_public_read" on public.${def.table} for select to anon, authenticated using (true);\n`;
  out += `create policy "${def.table}_service_write" on public.${def.table} for all to service_role using (true) with check (true);\n`;
  return out;
}

function printDdl() {
  console.log("-- 00XX_threepp_compendium.sql  (generated by threepp.mjs ddl — DO NOT hand-edit; regenerate)");
  console.log("-- 18 3pp tables on the PFcore compendium contract (public read · service write · tsvector+GIN).");
  console.log("-- Search RPCs are emitted separately by `threepp.mjs rpc` (0026 prefix/substring pattern).\n");
  for (const def of TABLES) console.log(ddlFor(def) + "\n");
}

function printRpcs() {
  console.log("-- 00XX_threepp_search_rpcs.sql  (generated by threepp.mjs rpc — migration-0026 pattern:");
  console.log("-- escape CTE + ILIKE substring WHERE + websearch FTS OR-branch; rank exact > prefix > substring > ts_rank)\n");
  for (const def of TABLES) if (def.browsable) console.log(rpcFor(def));
}

// Explicit grants (matches the 0024 RPC-execute convention, plus explicit table SELECT for anon/auth).
// compendium_distinct(text, text) already exists + is granted by migrations 0023/0024 — not re-emitted.
function printGrants() {
  console.log("-- 00XX_threepp_grants.sql  (generated by threepp.mjs grants — explicit grants)\n");
  for (const def of TABLES)
    console.log(`grant select on table public.${def.table} to anon, authenticated;`);
  console.log("");
  for (const def of TABLES)
    if (def.browsable) console.log(`grant execute on function public.search_${def.table}(text, int) to anon, authenticated;`);
}

// ──────────────────────────── LOAD ─────────────────────────────
function env() {
  const text = readFileSync(resolve(REPO, ".env.local"), "utf8");
  const get = (k) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SECRET_KEY") };
}

async function load(only) {
  const { createClient } = await import("@supabase/supabase-js");
  const { url, key } = env();
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  for (const def of TABLES) {
    if (only && def.table !== only) continue;
    const present = filesFor(def).filter((s) => existsSync(resolve(CSV, s.file)));
    if (present.length === 0) { console.warn(`! ${def.table.padEnd(34)} skipped — no TSV present`); continue; }
    const rows = rowsFor(def);
    const conflict = def.pk ? def.pk.join(",") : "slug";
    let done = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from(def.table).upsert(chunk, { onConflict: conflict });
      if (error) { console.error(`✗ ${def.table} @${i}: ${error.message}`); process.exitCode = 1; break; }
      done += chunk.length;
    }
    console.log(`✓ ${def.table.padEnd(34)} ${done}/${rows.length}`);
  }
}

function counts() {
  for (const def of TABLES) console.log(`${def.table.padEnd(34)} ${rowsFor(def).length}`);
}

// ──────────────────────────── PARSE ────────────────────────────
// Dry-run validation, no DB: per file — existence, constant column counts, header coverage of every
// mapped/needed column, unused TSV columns (informational), jsonb parse failures; per table — junction
// composite-key duplicates, slug collision suffixes, final row count.
function parse() {
  let anomalies = 0, total = 0;
  for (const def of TABLES) {
    const notes = [];
    let filesPresent = 0;
    for (const spec of filesFor(def)) {
      const path = resolve(CSV, spec.file);
      if (!existsSync(path)) { notes.push(`MISSING ${spec.file} (skipped)`); continue; }
      filesPresent++;
      const text = readFileSync(path, "utf8").replace(/\r/g, "");
      const lines = text.split("\n").filter((l) => l.length > 0);
      const header = lines[0].split("\t");
      const n = header.length;
      let bad = 0;
      const lineSeen = new Set(); let dupLines = 0;
      for (let li = 1; li < lines.length; li++) {
        if (lines[li].split("\t").length !== n) bad++;
        if (lineSeen.has(lines[li])) dupLines++; else lineSeen.add(lines[li]);
      }
      if (bad > 0) { notes.push(`${spec.file}: ${bad} rows with column count != ${n}`); anomalies++; }
      if (dupLines > 0) { notes.push(`${spec.file}: ${dupLines} byte-identical duplicate row(s) (loaded with a -N slug suffix)`); anomalies++; }
      // header coverage: every table col must come from the header, the map, or constants
      const inv = Object.fromEntries(Object.entries(spec.map ?? {}).map(([tsv, col]) => [col, tsv]));
      const missing = def.cols.filter((c) => !(spec.constants && c in spec.constants) && !header.includes(inv[c] ?? c));
      if (missing.length) { notes.push(`${spec.file}: header lacks source col(s): ${missing.join(", ")}`); anomalies++; }
      const used = new Set(def.cols.map((c) => inv[c] ?? c));
      const unused = header.filter((h) => !used.has(h) && !(spec.map && h in spec.map));
      if (unused.length) notes.push(`${spec.file}: unused TSV col(s): ${unused.join(", ")} (info)`);
      // jsonb parse check
      for (const jc of def.json ?? []) {
        const idx = header.indexOf(inv[jc] ?? jc);
        if (idx < 0) continue;
        let fails = 0;
        for (let li = 1; li < lines.length; li++) {
          const v = lines[li].split("\t")[idx] ?? "";
          if (v) { try { JSON.parse(v); } catch { fails++; } }
        }
        if (fails > 0) { notes.push(`${spec.file}: ${fails} unparseable ${jc} values (loaded as null)`); anomalies++; }
      }
    }
    if (filesPresent === 0) {
      console.log(`- ${def.table.padEnd(34)} 0     ${notes.join(" | ")}`);
      continue;
    }
    // build rows quietly to measure dedup/collisions
    const rows = rowsFor(def, { quiet: true });
    total += rows.length;
    if (def.pk) {
      const rawCount = filesFor(def).filter((s) => existsSync(resolve(CSV, s.file)))
        .reduce((acc, s) => acc + parseTsv(s.file).length, 0);
      if (rawCount !== rows.length) { notes.push(`${rawCount - rows.length} duplicate (${def.pk.join(",")}) rows dropped`); anomalies++; }
    }
    if (def.slug) {
      const suffixed = rows.filter((r) => /-\d+$/.test(r.slug) && !def.slug.includes("#")).length;
      if (suffixed > 0) notes.push(`${suffixed} slug collision(s) suffixed (info)`);
    }
    console.log(`✓ ${def.table.padEnd(34)} ${String(rows.length).padStart(5)} ${notes.length ? " " + notes.join(" | ") : ""}`);
  }
  console.log(`\n${total} rows across ${TABLES.length} configured tables; ${anomalies} anomal${anomalies === 1 ? "y" : "ies"}.`);
}

const cmd = process.argv[2];
if (cmd === "ddl") printDdl();
else if (cmd === "rpc") printRpcs();
else if (cmd === "grants") printGrants();
else if (cmd === "counts") counts();
else if (cmd === "parse") parse();
else if (cmd === "load") await load(process.argv[3]);
else { console.error("usage: node threepp.mjs ddl|rpc|grants|load [table]|counts|parse"); process.exit(1); }
