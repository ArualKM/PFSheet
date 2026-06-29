-- Generic distinct-values helper for compendium filter dropdowns. Restricted to *_compendium tables +
-- lowercase identifier columns (so the dynamic SQL can't be abused); SECURITY INVOKER so RLS still applies.
-- Used by lib compendium-browser distinctValues() so filter lists aren't truncated by the default row cap.
create or replace function public.compendium_distinct(p_table text, p_col text)
returns table(value text)
language plpgsql stable
set search_path = public
as $$
begin
  if p_table !~ '^[a-z_]+_compendium$' then
    raise exception 'compendium_distinct: table % not allowed', p_table;
  end if;
  if p_col !~ '^[a-z_]+$' then
    raise exception 'compendium_distinct: column % not allowed', p_col;
  end if;
  return query execute format(
    'select distinct %I::text from public.%I where %I is not null and %I <> '''' order by 1',
    p_col, p_table, p_col, p_col
  );
end;
$$;
