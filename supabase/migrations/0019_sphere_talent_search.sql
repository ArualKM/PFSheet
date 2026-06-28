-- Ranked talent search for the Spheres picker/browser. Like search_spell_compendium: substring
-- (ilike) matching with LIKE-metacharacter escaping, ranked by an explicit hierarchy so the best
-- match surfaces FIRST (and isn't truncated by the row limit, unlike a plain alphabetical order).
-- Hierarchy: exact name → name prefix → name contains → sphere → tags → description. Optional sphere
-- + category filters. Public-read like the table, so it runs SECURITY INVOKER under the read policy.
create or replace function public.search_sphere_talents(
  p_query text default '',
  p_sphere text default '',
  p_category text default '',
  p_limit int default 40
)
returns table (
  id uuid,
  sphere_name text,
  talent_name text,
  talent_category text,
  subcategory text,
  source text,
  tags text,
  prerequisites text,
  base_cost text,
  description text
)
language sql
stable
set search_path = public, pg_temp
as $$
  with q as (select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc)
  select
    s.id, s.sphere_name, s.talent_name, s.talent_category, s.subcategory,
    s.source, s.tags, s.prerequisites, s.base_cost, s.description
  from public.sphere_talents s, q
  where
    (coalesce(p_sphere, '') = '' or s.sphere_name = p_sphere)
    and (coalesce(p_category, '') = '' or s.talent_category = p_category)
    and (
      coalesce(p_query, '') = ''
      or s.talent_name ilike '%' || q.esc || '%'
      or s.sphere_name ilike '%' || q.esc || '%'
      or coalesce(s.tags, '') ilike '%' || q.esc || '%'
      or coalesce(s.description, '') ilike '%' || q.esc || '%'
    )
  order by
    case
      when coalesce(p_query, '') = '' then 5
      when lower(s.talent_name) = lower(p_query) then 0
      when s.talent_name ilike q.esc || '%' then 1
      when s.talent_name ilike '%' || q.esc || '%' then 2
      when s.sphere_name ilike '%' || q.esc || '%' then 3
      when coalesce(s.tags, '') ilike '%' || q.esc || '%' then 4
      else 5
    end,
    s.sphere_name,
    s.talent_name
  limit greatest(1, least(p_limit, 100));
$$;
grant execute on function public.search_sphere_talents(text, text, text, int) to anon, authenticated;
