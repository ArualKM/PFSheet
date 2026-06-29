#!/usr/bin/env node
// PFcore compendium loader — config-driven. ONE source of truth for both the Supabase DDL and the bulk
// TSV load, so the ~25 tables stay consistent (compendium contract: public read · service write · tsvector
// search · search RPC · GIN). Reproducible + idempotent (upsert on slug). No secrets are hardcoded — the
// service key is read from ../../../../.env.local at runtime.
//
//   node pfcore.mjs ddl              → print the full migration SQL (apply via Supabase)
//   node pfcore.mjs load [table]     → bulk-load all TSVs (or one) into Supabase via the service role
//   node pfcore.mjs counts           → print row counts the loader sees per TSV
//
// TSV convention (Spheres standard): tab-delimited, one physical line per record, internal breaks as <br>,
// no stray \t\r\n in cells — so split('\n') / split('\t') is safe.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(HERE, "..");            // the csv/ folder (TSVs live here)
const REPO = resolve(HERE, "..", "..", "..", ".."); // repo root (.env.local + node_modules)

/** Each table: the columns are the TSV header order; `search` = cols folded into the tsvector;
 *  `order` = default sort col (must exist); `slug` = parts of the stable id ('#' → append row index);
 *  `json` = cols typed jsonb; `browsable` adds the search vector + RPC. */
const TABLES = [
  // ── feats + traits ──
  { table: "feat_compendium", file: "feats.tsv",
    cols: ["name","types","source","description","prerequisites","benefit","normal","special","mythic","combat_trick","url"],
    search: ["name","types","description","benefit","prerequisites"], order: "name", slug: ["name"], browsable: true },
  { table: "feat_prerequisite", file: "feat_prerequisites.tsv",
    cols: ["feat","req_type","req_value"], parent: "feat", slug: ["feat","req_type","req_value","#"], browsable: false },
  { table: "feat_effect", file: "feats_effects.tsv",
    cols: ["feat","target","op","value_or_formula","bonus_type","notes"], parent: "feat", slug: ["feat","target","#"], browsable: false },
  { table: "trait_compendium", file: "traits.tsv",
    cols: ["name","type","category","source","requirements","description","url"],
    search: ["name","type","category","description"], order: "name", slug: ["name","type"], browsable: true },
  { table: "drawback_compendium", file: "drawbacks.tsv",
    cols: ["name","source","requirements","description","url"], search: ["name","description"], order: "name", slug: ["name"], browsable: true },
  // ── classes ──
  { table: "class_compendium", file: "classes.tsv",
    cols: ["name","category","source","hit_die","alignment","role","starting_wealth","class_skills","skill_points_per_level","proficiencies","description","url"],
    search: ["name","description","role"], order: "name", slug: ["name"], browsable: true },
  { table: "class_progression", file: "class_progression.tsv",
    cols: ["class","json_data"], json: ["json_data"], parent: "class", slug: ["class"], browsable: false },
  { table: "class_feature_compendium", file: "class_features.tsv",
    cols: ["class","category","feature","type","level","description","url"],
    search: ["feature","description"], order: "feature", parent: "class", slug: ["class","feature","level","#"], browsable: true },
  { table: "class_option_compendium", file: "class_options.tsv",
    cols: ["class","option_type","name","subtype","group","source","description","url"],
    search: ["name","description","option_type"], order: "name", parent: "class", slug: ["class","option_type","name","#"], browsable: true },
  { table: "feature_effect", file: "features_effects.tsv",
    cols: ["class","feature","target","op","value_or_formula","bonus_type","notes"], parent: "class", slug: ["class","feature","target","#"], browsable: false },
  // ── archetypes + prestige ──
  { table: "archetype_compendium", file: "archetypes.tsv",
    cols: ["name","class","source","description","url"], search: ["name","class","description"], order: "name", parent: "class", slug: ["name","class"], browsable: true },
  { table: "archetype_feature_compendium", file: "archetype_features.tsv",
    cols: ["archetype","class","feature","type","level","replaces","text","source","url"],
    search: ["feature","text"], order: "feature", parent: "archetype", slug: ["archetype","feature","level","#"], browsable: true },
  { table: "prestige_class_compendium", file: "prestige_classes.tsv",
    cols: ["name","source","hit_die","alignment","role","requirements","description","url"],
    search: ["name","description","requirements"], order: "name", slug: ["name"], browsable: true },
  { table: "prestige_progression", file: "prestige_progression.tsv",
    cols: ["class","json_data"], json: ["json_data"], parent: "class", slug: ["class"], browsable: false },
  // ── races ──
  { table: "race_compendium", file: "races.tsv",
    cols: ["name","category","source","details","url"], search: ["name","details"], order: "name", slug: ["name"], browsable: true },
  { table: "race_trait_compendium", file: "race_traits.tsv",
    cols: ["race","category","source","ability_modifiers","size","speed","standard_traits","url"],
    search: ["race","standard_traits"], order: "race", parent: "race", slug: ["race"], browsable: true },
  { table: "alternate_racial_trait_compendium", file: "alternate_racial_traits.tsv",
    cols: ["race","trait_name","replaces","source","description","url"],
    search: ["trait_name","description"], order: "trait_name", parent: "race", slug: ["race","trait_name","#"], browsable: true },
  { table: "favored_class_option_compendium", file: "favored_class_options.tsv",
    cols: ["race","class","benefit","source","url"], parent: "race", slug: ["race","class","#"], browsable: false },
  // ── mythic ──
  { table: "mythic_path_compendium", file: "mythic_paths.tsv",
    cols: ["name","source","description","json_data","url"], json: ["json_data"], search: ["name","description"], order: "name", slug: ["name"], browsable: true },
  { table: "mythic_path_ability_compendium", file: "mythic_path_abilities.tsv",
    cols: ["path","name","type","source","description","url"], search: ["name","description"], order: "name", parent: "path", slug: ["path","name","#"], browsable: true },
  { table: "mythic_spell_augment", file: "mythic_spells.tsv",
    cols: ["name","school","subschool","descriptors","level","casting_time","components","range","target","area","effect","duration","saving_throw","spell_resistance","description","mythic","source","url"],
    search: ["name","description","mythic"], order: "name", slug: ["name"], browsable: true },
  // ── companions ──
  { table: "animal_companion_compendium", file: "animal_companions.tsv",
    cols: ["name","category","source","size","speed","ac","attack","ability_scores","special_qualities","starting_stats","advancement","flavor","monster_url","url"],
    search: ["name","special_qualities","flavor"], order: "name", slug: ["name"], browsable: true },
  { table: "familiar_compendium", file: "familiars.tsv",
    cols: ["name","granted_ability","url"], search: ["name","granted_ability"], order: "name", slug: ["name"], browsable: true },
  { table: "eidolon_base_form_compendium", file: "eidolon_base_forms.tsv",
    cols: ["name","source","description","url"], search: ["name","description"], order: "name", slug: ["name"], browsable: true },
  { table: "eidolon_evolution_compendium", file: "eidolon_evolutions.tsv",
    cols: ["name","cost","source","description","url"], search: ["name","description"], order: "name", slug: ["name"], browsable: true },
];

const slugify = (s) =>
  String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "x";

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

function rowsFor(def) {
  const raw = parseTsv(def.file);
  const seen = new Map();
  return raw.map((r, i) => {
    const out = { slug: "" };
    for (const c of def.cols) {
      let v = r[c] ?? "";
      if (def.json?.includes(c)) {
        try { v = v ? JSON.parse(v) : null; } catch { v = null; }
      } else {
        v = v === "" ? null : v;
      }
      out[c] = v;
    }
    let base = def.slug.filter((p) => p !== "#").map((p) => slugify(r[p])).join("-");
    if (def.slug.includes("#")) base = `${base}-${i}`;
    // guard against any residual collision
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    out.slug = n > 1 ? `${base}-${n}` : base;
    return out;
  });
}

// ───────────────────────────── DDL ─────────────────────────────
// Ranked search RPC: exact name match → prefix match → FTS rank; empty query = alpha browse.
function rpcFor(def) {
  return (
    `create or replace function public.search_${def.table}(p_query text default '', p_limit int default 60)\n` +
    `returns setof public.${def.table} language sql stable set search_path = public as $func$\n` +
    `  select * from public.${def.table}\n` +
    `  where p_query = '' or search @@ websearch_to_tsquery('english', p_query)\n` +
    `  order by\n` +
    `    case when p_query = '' then 2 when lower("${def.order}") = lower(p_query) then 0 when "${def.order}" ilike p_query || '%' then 1 else 2 end,\n` +
    `    case when p_query = '' then 0 else ts_rank(search, websearch_to_tsquery('english', p_query)) end desc,\n` +
    `    "${def.order}"\n` +
    `  limit greatest(1, least(p_limit, 200));\n$func$;\n`
  );
}

function ddlFor(def) {
  // Always double-quote column identifiers — some TSV headers collide with reserved words (e.g. `group`).
  const colSql = def.cols
    .map((c) => `  "${c}" ${def.json?.includes(c) ? "jsonb" : "text"}`)
    .join(",\n");
  const searchSql = def.browsable
    ? `,\n  search tsvector generated always as (to_tsvector('english', ${def.search
        .map((c) => `coalesce("${c}",'')`)
        .join(" || ' ' || ")})) stored`
    : "";
  let out = `create table if not exists public.${def.table} (\n  slug text primary key,\n${colSql}${searchSql}\n);\n`;
  if (def.browsable) out += `create index if not exists ${def.table}_search_idx on public.${def.table} using gin (search);\n`;
  if (def.parent) out += `create index if not exists ${def.table}_${def.parent}_idx on public.${def.table} ("${def.parent}");\n`;
  out += `alter table public.${def.table} enable row level security;\n`;
  out += `create policy "${def.table}_public_read" on public.${def.table} for select using (true);\n`;
  out += `create policy "${def.table}_service_write" on public.${def.table} for all to service_role using (true) with check (true);\n`;
  if (def.browsable) out += rpcFor(def);
  return out;
}

function printRpcs() {
  console.log("-- 0022_pfcore_search_rank.sql  (generated by pfcore.mjs — exact/prefix-boosted ranking)\n");
  for (const def of TABLES) if (def.browsable) console.log(rpcFor(def));
}

function printDdl() {
  console.log("-- 0021_pfcore_compendium.sql  (generated by pfcore.mjs — DO NOT hand-edit; regenerate)\n");
  for (const def of TABLES) console.log(ddlFor(def) + "\n");
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
    const rows = rowsFor(def);
    let done = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from(def.table).upsert(chunk, { onConflict: "slug" });
      if (error) { console.error(`✗ ${def.table} @${i}: ${error.message}`); process.exitCode = 1; break; }
      done += chunk.length;
    }
    console.log(`✓ ${def.table.padEnd(34)} ${done}/${rows.length}`);
  }
}

function counts() {
  for (const def of TABLES) console.log(`${def.table.padEnd(34)} ${rowsFor(def).length}`);
}

const cmd = process.argv[2];
if (cmd === "ddl") printDdl();
else if (cmd === "rpc") printRpcs();
else if (cmd === "counts") counts();
else if (cmd === "load") await load(process.argv[3]);
else { console.error("usage: node pfcore.mjs ddl|rpc|load [table]|counts"); process.exit(1); }
