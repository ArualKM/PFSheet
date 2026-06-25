-- Spell compendium search for the Spells-tab picker (§6.10 / Spells).
-- Filters the ~3,034-row compendium by the character's casting classes and the
-- spell level they can currently cast, and ranks matches by a name -> school ->
-- descriptor -> description hierarchy. Public-read like the table itself, so it
-- runs as SECURITY INVOKER under the existing "readable by everyone" policy.
--
-- p_classes maps a class name to the max spell level that class can currently
-- cast, e.g. {"Wizard": 3, "Cleric": 2}. An empty object disables class/castable
-- filtering (browse the whole compendium).
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
  with keys as (select array(select jsonb_object_keys(p_classes)) as arr)
  select
    s.id, s.name, s.school, s.subschool, s.descriptor, s.class_levels,
    s.casting_time, s.components, s.range, s.duration, s.saving_throw,
    s.spell_resistance, s.description, s.source,
    (select min((s.class_levels->>k)::int)
       from unnest((select arr from keys)) k
       where s.class_levels ? k)::int as class_level
  from public.spell_compendium s, keys
  where
    (p_classes = '{}'::jsonb or not p_only_class_list or s.class_levels ?| keys.arr)
    and (p_classes = '{}'::jsonb or not p_only_castable or exists (
      select 1 from unnest(keys.arr) k
      where s.class_levels ? k and (s.class_levels->>k)::int <= (p_classes->>k)::int
    ))
    and (
      p_query = ''
      or s.name ilike '%' || p_query || '%'
      or s.school ilike '%' || p_query || '%'
      or coalesce(s.descriptor, '') ilike '%' || p_query || '%'
      or coalesce(s.description, '') ilike '%' || p_query || '%'
    )
  order by
    case
      when p_query = '' then 1
      when s.name ilike p_query || '%' then 0
      when s.name ilike '%' || p_query || '%' then 1
      when s.school ilike '%' || p_query || '%' then 2
      when coalesce(s.descriptor, '') ilike '%' || p_query || '%' then 3
      else 4
    end,
    s.name
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.search_spell_compendium(text, jsonb, boolean, boolean, int) to anon, authenticated;
