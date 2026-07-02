create or replace function public.search_psionic_power_compendium(p_query text default '', p_limit int default 60)
returns setof public.psionic_power_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.psionic_power_compendium t, q
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

create or replace function public.search_pow_discipline_compendium(p_query text default '', p_limit int default 60)
returns setof public.pow_discipline_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.pow_discipline_compendium t, q
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

create or replace function public.search_pow_maneuver_compendium(p_query text default '', p_limit int default 60)
returns setof public.pow_maneuver_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.pow_maneuver_compendium t, q
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

create or replace function public.search_akashic_veil_compendium(p_query text default '', p_limit int default 60)
returns setof public.akashic_veil_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.akashic_veil_compendium t, q
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

create or replace function public.search_threepp_feat_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_feat_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_feat_compendium t, q
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

create or replace function public.search_threepp_class_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_class_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_class_compendium t, q
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

create or replace function public.search_threepp_archetype_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_archetype_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_archetype_compendium t, q
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

create or replace function public.search_threepp_class_option_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_class_option_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_class_option_compendium t, q
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

create or replace function public.search_oath_compendium(p_query text default '', p_limit int default 60)
returns setof public.oath_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.oath_compendium t, q
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

create or replace function public.search_oath_boon_compendium(p_query text default '', p_limit int default 60)
returns setof public.oath_boon_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.oath_boon_compendium t, q
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

create or replace function public.search_threepp_drawback_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_drawback_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_drawback_compendium t, q
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

create or replace function public.search_background_compendium(p_query text default '', p_limit int default 60)
returns setof public.background_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.background_compendium t, q
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

create or replace function public.search_occupation_compendium(p_query text default '', p_limit int default 60)
returns setof public.occupation_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.occupation_compendium t, q
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

create or replace function public.search_threepp_race_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_race_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_race_compendium t, q
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

create or replace function public.search_threepp_racial_trait_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_racial_trait_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_racial_trait_compendium t, q
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

create or replace function public.search_threepp_trait_compendium(p_query text default '', p_limit int default 60)
returns setof public.threepp_trait_compendium language sql stable set search_path = public as $func$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select t.* from public.threepp_trait_compendium t, q
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


-- 00XX_threepp_grants.sql  (generated by threepp.mjs grants — explicit grants)

grant select on table public.psionic_power_compendium to anon, authenticated;
grant select on table public.psionic_power_class_level to anon, authenticated;
grant select on table public.pow_discipline_compendium to anon, authenticated;
grant select on table public.pow_maneuver_compendium to anon, authenticated;
grant select on table public.akashic_veil_compendium to anon, authenticated;
grant select on table public.akashic_veil_class_list to anon, authenticated;
grant select on table public.threepp_feat_compendium to anon, authenticated;
grant select on table public.threepp_class_compendium to anon, authenticated;
grant select on table public.threepp_archetype_compendium to anon, authenticated;
grant select on table public.threepp_class_option_compendium to anon, authenticated;
grant select on table public.oath_compendium to anon, authenticated;
grant select on table public.oath_boon_compendium to anon, authenticated;
grant select on table public.threepp_drawback_compendium to anon, authenticated;
grant select on table public.background_compendium to anon, authenticated;
grant select on table public.occupation_compendium to anon, authenticated;
grant select on table public.threepp_race_compendium to anon, authenticated;
grant select on table public.threepp_racial_trait_compendium to anon, authenticated;
grant select on table public.threepp_trait_compendium to anon, authenticated;

grant execute on function public.search_psionic_power_compendium(text, int) to anon, authenticated;
grant execute on function public.search_pow_discipline_compendium(text, int) to anon, authenticated;
grant execute on function public.search_pow_maneuver_compendium(text, int) to anon, authenticated;
grant execute on function public.search_akashic_veil_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_feat_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_class_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_archetype_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_class_option_compendium(text, int) to anon, authenticated;
grant execute on function public.search_oath_compendium(text, int) to anon, authenticated;
grant execute on function public.search_oath_boon_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_drawback_compendium(text, int) to anon, authenticated;
grant execute on function public.search_background_compendium(text, int) to anon, authenticated;
grant execute on function public.search_occupation_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_race_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_racial_trait_compendium(text, int) to anon, authenticated;
grant execute on function public.search_threepp_trait_compendium(text, int) to anon, authenticated;
