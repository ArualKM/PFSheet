-- 0029 — Compendium browse sort indexes
--
-- Every compendium browse page (CompendiumBrowser) orders by `name`, but these tables shipped with
-- only a PK on `slug` + a GIN index on the `search` tsvector — nothing on `name`. So the default
-- browse `... ORDER BY name LIMIT 30` does a Seq Scan + top-N heapsort over the whole table on each
-- render (measured 4–12 ms today, but O(rows) as content grows; archetype-adjacent tables are already
-- 6k+ rows). A btree on the sort column makes browse an index walk. `spell_compendium` already has
-- `idx_spell_compendium_name`, so it's omitted here.
--
-- Additive + idempotent (CREATE INDEX IF NOT EXISTS). These are read-only reference tables written
-- only on reseed, so the brief SHARE lock is inconsequential.

create index if not exists idx_feat_compendium_name on public.feat_compendium (name);
create index if not exists idx_trait_compendium_name on public.trait_compendium (name);
create index if not exists idx_race_compendium_name on public.race_compendium (name);
create index if not exists idx_archetype_compendium_name on public.archetype_compendium (name);
create index if not exists idx_class_compendium_name on public.class_compendium (name);
create index if not exists idx_class_option_compendium_name on public.class_option_compendium (name);
create index if not exists idx_prestige_class_compendium_name on public.prestige_class_compendium (name);
create index if not exists idx_psionic_power_compendium_name on public.psionic_power_compendium (name);
create index if not exists idx_pow_maneuver_compendium_name on public.pow_maneuver_compendium (name);
create index if not exists idx_akashic_veil_compendium_name on public.akashic_veil_compendium (name);
create index if not exists idx_oath_compendium_name on public.oath_compendium (name);
create index if not exists idx_oath_boon_compendium_name on public.oath_boon_compendium (name);
create index if not exists idx_threepp_class_compendium_name on public.threepp_class_compendium (name);
create index if not exists idx_threepp_feat_compendium_name on public.threepp_feat_compendium (name);
create index if not exists idx_threepp_trait_compendium_name on public.threepp_trait_compendium (name);
create index if not exists idx_threepp_archetype_compendium_name on public.threepp_archetype_compendium (name);
create index if not exists idx_threepp_class_option_compendium_name on public.threepp_class_option_compendium (name);
create index if not exists idx_threepp_drawback_compendium_name on public.threepp_drawback_compendium (name);
