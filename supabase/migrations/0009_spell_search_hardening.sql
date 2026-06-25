-- Hardening for search_spell_compendium (from the spell-picker review):
--  * Escape LIKE metacharacters (% _ \) in p_query so a literal "%" doesn't match
--    everything and "fir_" doesn't act as a wildcard.
--  * Null-safe p_classes: an explicit null (vs the '{}' default) must behave like
--    "no class filter" rather than silently returning zero rows.
-- Same signature, so the existing grant is preserved.
create or replace function public.search_spell_compendium(
  p_query text default '',
  p_classes jsonb default '{}'::jsonb,
  p_only_class_list boolean default true,
  p_only_castable boolean default true,
  p_limit int default 40
)
returns table (
  id uuid,
  name text,
  school text,
  subschool text,
  descriptor text,
  class_levels jsonb,
  casting_time text,
  components text,
  range text,
  duration text,
  saving_throw text,
  spell_resistance text,
  description text,
  source text,
  class_level int
)
language sql
stable
set search_path = public, pg_temp
as $$
  with c as (select coalesce(p_classes, '{}'::jsonb) as v),
       keys as (select array(select jsonb_object_keys(v)) as arr from c),
       q as (select replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') as esc)
  select
    s.id, s.name, s.school, s.subschool, s.descriptor, s.class_levels,
    s.casting_time, s.components, s.range, s.duration, s.saving_throw,
    s.spell_resistance, s.description, s.source,
    (select min((s.class_levels->>k)::int)
       from unnest((select arr from keys)) k
       where s.class_levels ? k)::int as class_level
  from public.spell_compendium s, c, keys, q
  where
    (cardinality(keys.arr) = 0 or not p_only_class_list or s.class_levels ?| keys.arr)
    and (cardinality(keys.arr) = 0 or not p_only_castable or exists (
      select 1 from unnest(keys.arr) k
      where s.class_levels ? k and (s.class_levels->>k)::int <= (c.v->>k)::int
    ))
    and (
      p_query = ''
      or s.name ilike '%' || q.esc || '%'
      or s.school ilike '%' || q.esc || '%'
      or coalesce(s.descriptor, '') ilike '%' || q.esc || '%'
      or coalesce(s.description, '') ilike '%' || q.esc || '%'
    )
  order by
    case
      when p_query = '' then 1
      when s.name ilike q.esc || '%' then 0
      when s.name ilike '%' || q.esc || '%' then 1
      when s.school ilike '%' || q.esc || '%' then 2
      when coalesce(s.descriptor, '') ilike '%' || q.esc || '%' then 3
      else 4
    end,
    s.name
  limit greatest(1, least(p_limit, 100));
$$;
