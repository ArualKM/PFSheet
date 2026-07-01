-- 0026_pfcore_search_prefix.sql
-- Fix: the 0021/0022 search RPCs gate the WHERE clause on
-- 'search @@ websearch_to_tsquery(...)' alone, which only matches complete
-- words — typing "Wiza" never finds "Wizard" (owner-reported; applies to all
-- 19 PFcore compendium tables). Regenerate every RPC on the proven
-- spell/sphere pattern (0009/0019): escape LIKE metacharacters, match the
-- label column by SUBSTRING (prefix typing works), keep the tsvector FTS as
-- an OR-branch for multi-word/description queries, and rank
-- exact > prefix > substring > ts_rank. Signatures unchanged, so the 0024
-- grants are preserved.

create or replace function public.search_feat_compendium(p_query text default '', p_limit int default 60)
returns setof public.feat_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.feat_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_trait_compendium(p_query text default '', p_limit int default 60)
returns setof public.trait_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.trait_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_drawback_compendium(p_query text default '', p_limit int default 60)
returns setof public.drawback_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.drawback_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_class_compendium(p_query text default '', p_limit int default 60)
returns setof public.class_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.class_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_class_feature_compendium(p_query text default '', p_limit int default 60)
returns setof public.class_feature_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.class_feature_compendium t, q
  where coalesce(p_query, '') = ''
     or t."feature" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."feature") = lower(p_query) then 0
      when t."feature" ilike q.esc || '%' then 1
      when t."feature" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."feature"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_class_option_compendium(p_query text default '', p_limit int default 60)
returns setof public.class_option_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.class_option_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_archetype_compendium(p_query text default '', p_limit int default 60)
returns setof public.archetype_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.archetype_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_archetype_feature_compendium(p_query text default '', p_limit int default 60)
returns setof public.archetype_feature_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.archetype_feature_compendium t, q
  where coalesce(p_query, '') = ''
     or t."feature" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."feature") = lower(p_query) then 0
      when t."feature" ilike q.esc || '%' then 1
      when t."feature" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."feature"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_prestige_class_compendium(p_query text default '', p_limit int default 60)
returns setof public.prestige_class_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.prestige_class_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_race_compendium(p_query text default '', p_limit int default 60)
returns setof public.race_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.race_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_race_trait_compendium(p_query text default '', p_limit int default 60)
returns setof public.race_trait_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.race_trait_compendium t, q
  where coalesce(p_query, '') = ''
     or t."race" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."race") = lower(p_query) then 0
      when t."race" ilike q.esc || '%' then 1
      when t."race" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."race"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_alternate_racial_trait_compendium(p_query text default '', p_limit int default 60)
returns setof public.alternate_racial_trait_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.alternate_racial_trait_compendium t, q
  where coalesce(p_query, '') = ''
     or t."trait_name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."trait_name") = lower(p_query) then 0
      when t."trait_name" ilike q.esc || '%' then 1
      when t."trait_name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."trait_name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_mythic_path_compendium(p_query text default '', p_limit int default 60)
returns setof public.mythic_path_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.mythic_path_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_mythic_path_ability_compendium(p_query text default '', p_limit int default 60)
returns setof public.mythic_path_ability_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.mythic_path_ability_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_mythic_spell_augment(p_query text default '', p_limit int default 60)
returns setof public.mythic_spell_augment language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.mythic_spell_augment t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_animal_companion_compendium(p_query text default '', p_limit int default 60)
returns setof public.animal_companion_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.animal_companion_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_familiar_compendium(p_query text default '', p_limit int default 60)
returns setof public.familiar_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.familiar_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_eidolon_base_form_compendium(p_query text default '', p_limit int default 60)
returns setof public.eidolon_base_form_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.eidolon_base_form_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;

create or replace function public.search_eidolon_evolution_compendium(p_query text default '', p_limit int default 60)
returns setof public.eidolon_evolution_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.eidolon_evolution_compendium t, q
  where coalesce(p_query, '') = ''
     or t."name" ilike '%' || q.esc || '%'
     or t.search @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when coalesce(p_query, '') = '' then 3
      when lower(t."name") = lower(p_query) then 0
      when t."name" ilike q.esc || '%' then 1
      when t."name" ilike '%' || q.esc || '%' then 2
      else 3
    end,
    case when coalesce(p_query, '') = '' then 0 else ts_rank(t.search, websearch_to_tsquery('english', p_query)) end desc,
    t."name"
  limit greatest(1, least(p_limit, 200));
$func$;
