# Instructions for Claude Ultracode — Loading the 3pp Compendium

This is the implementer's guide for turning `3pp Update/csv/*.tsv` into live PathForge/Supabase compendium tables + sheet UI. It assumes the `PFcore Update` compendium already exists and follows the identical contract.

## 1. Compendium contract (per table)

For every TSV table create an **additive** Postgres/Supabase table:

- `id bigint generated always as identity primary key`
- one column per TSV header (all `text`, except numeric where noted; JSON columns are `jsonb`)
- `system text not null` (already present, or set from the table's system)
- `search tsvector generated always as (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'') || …)) stored` + a GIN index
- **RLS:** `select` for `anon`/`authenticated`; `insert/update/delete` for `service_role` only
- a `search_<table>(query text, system text default null)` RPC (SECURITY DEFINER) that filters by `search @@ websearch_to_tsquery` and optional `system`
- keep `source` + `url` on every row (citation/attribution is required)

Load TSVs with `COPY … FROM … WITH (FORMAT csv, DELIMITER E'\t', HEADER true, QUOTE E'\b')` (no quote char — fields are pre-escaped; `<br>` is literal). Decode `<br>`→newline at render time. `progression_json` is `jsonb`.

## 2. System gating

Each system is a settings toggle (`psionic`, `path_of_war`, `akashic`, `spheres`, `optional`). When a system is off, its compendium rows are hidden and its pickers/pools disappear. Store enabled systems on the character (or campaign) and filter every query by `system = any(enabled)`.

## 3. Per-system UI

**Psionics** — spell-list-style **power picker**. Default view = the character's class list via `psionic_power_class_levels` (join on class, order by level); uncheck filters to browse all `psionic_powers`. Show discipline, PP cost, Display; Augment expandable; Mythic toggle. Add a **Power Points pool** resource and a **Powers Known** tracker. Cross-access (e.g. *Expanded Knowledge*) = layer granted powers onto the class list. Filters: level, discipline, descriptors, source.

**Path of War** — **maneuvers known/readied/stances** selectors. A class's available disciplines come from the class (+ archetypes + discipline-access feats); pull maneuvers from `pow_maneuvers where discipline in (…)`. Split Maneuver vs Stance by `category`; filter by `type` (Strike/Boost/Counter/…), level, discipline. Track initiation modifier + recovery method.

**Akashic** — **veil-shaping** picker. Default = class veil list via `veil_class_lists`; veils bind to chakra **slots** with distinct **bind effects** (`bind_effect`), unlocked by level. Add an **Essence pool** tracker and per-veil essence investment. Toggle Retold/original variants via `is_retold`. Filter by slot, descriptors, source.

**Spheres** — already the PFcore talent-tree model; add `threepp_archetypes where system='spheres'` and `spheres_class_options` to the class-build UI. Fold the Spheres extras (Mythic Spheres, Strain/Madness, Oaths) into the Spheres area.

**Feats (shared)** — on the main Feats page, add a **secondary source-tagged table** unioning `metzofitz_feats` + `spheres_feats`, filterable by `system`. Same for future 3pp traits / alt racial traits on the Traits / Race pages.

## 4. Classes & archetypes

- `threepp_classes` — render base/prestige classes; `progression_json` is the per-level table (BAB/saves/Special/known-readied-stances). Hit die, skill points, alignment as columns; class features listed in `class_features` and per-level in `progression_json`.
- `threepp_archetypes` — an archetype swaps class features on its `base_class`; `altered_features` lists the changed feature names, `description` holds the rules. Apply as feature overrides on the base class.

## 5. Automation (effects → `@{…}` DSL)

Wire the deterministic pieces exactly like PFcore; leave situational text as description.

- **Resource pools:** power points, essence, initiation/maneuver counts → resource rows with max formulas.
- **Bind effects / stances:** `bind_effect` and stance rows → conditional effect rows `{target, op, value/formula, bonusType}` toggled when the veil is bound / stance is active.
- **Oaths & boons:** taking an oath adds `oath_points`; boons spend `oath_point_cost`; enforce a running Oath-Point budget. Boon grants → effect rows.
- **Drawbacks / flaws:** picking one applies its penalty (effect row) and grants the trade-in bonus (bonus feat / benefit).
- **Backgrounds / occupations:** picking one auto-applies its granted feat + class skill (or +1 skill bonus) — push the feat, set the class skill.

## 6. Custom builders

Every optional system needs a **custom builder** (stored on the character, applied via the same hooks): custom power (discipline, level, PP, effect, augment), custom veil (slot(s), descriptors, effect, bind effects), custom maneuver/stance, custom oath/boon, custom drawback/flaw, custom background/occupation (choose the feat to push + which skill becomes a class skill / gets +1). This satisfies the "let players implement their own versions" requirement.

## 7. Load order

1. Rules catalogs first: `psionic_powers` (+ `psionic_power_class_levels`), `pow_disciplines` (+ `pow_maneuvers`), `akashic_veils` (+ `veil_class_lists`).
2. Feats: `metzofitz_feats`, `spheres_feats`.
3. Classes/archetypes/options: `threepp_classes`, `threepp_archetypes`, `spheres_class_options`.
4. Optional rulesets: `oaths`+`oath_boons`, `major_drawbacks`, `flaws`, `backgrounds`+`occupations`.

All tables are additive — loading them never modifies existing PFcore data.
