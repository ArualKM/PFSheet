-- 0015_rls_initplan_optimization.sql
-- Performance advisor (auth_rls_initplan): RLS policies that call auth.uid()/auth.role()
-- directly re-evaluate the function once PER ROW. Wrapping the call in a scalar subquery
-- — (select auth.uid()) — lets Postgres evaluate it ONCE per statement (initplan) and
-- reuse the result, a large win on table scans. This is the optimization Supabase itself
-- recommends; it is behavior-IDENTICAL (same value, same access decisions).
--
-- Rather than hand-retype 50+ policies (transcription risk), this recreates each affected
-- policy from its OWN live definition, performing ONLY the textual wrap. The exact same
-- expression is preserved aside from the (select ...) wrap, so access semantics cannot
-- change — only a bug in this generator could, which is why it is branch-tested first.
--
-- Scope: every public.* policy that references auth.uid()/auth.role(), EXCEPT the
-- spell_compendium policies (CLAUDE.md: never alter spell_compendium) — its one initplan
-- hit is intentionally left as-is.

do $$
declare
  r record;
  v_cmd text;
  v_roles text;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select c.relname as tbl,
           p.polname as nm,
           p.polcmd as cmd,
           p.polpermissive as permissive,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as wcheck,
           (select string_agg(quote_ident(rolname), ', ')
              from pg_roles where oid = any (p.polroles)) as roles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname <> 'spell_compendium'
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'auth\.(uid|role)\(\)'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'auth\.(uid|role)\(\)'
      )
  loop
    v_cmd := case r.cmd
               when 'r' then 'select'
               when 'a' then 'insert'
               when 'w' then 'update'
               when 'd' then 'delete'
               when '*' then 'all'
             end;
    -- polroles = {0} (PUBLIC) yields no pg_roles rows -> default to public
    v_roles := coalesce(r.roles, 'public');

    v_using := r.qual;
    v_check := r.wcheck;
    if v_using is not null then
      v_using := replace(replace(v_using, 'auth.uid()', '(select auth.uid())'),
                         'auth.role()', '(select auth.role())');
    end if;
    if v_check is not null then
      v_check := replace(replace(v_check, 'auth.uid()', '(select auth.uid())'),
                         'auth.role()', '(select auth.role())');
    end if;

    execute format('drop policy %I on public.%I', r.nm, r.tbl);

    v_sql := format('create policy %I on public.%I as %s for %s to %s',
                    r.nm, r.tbl,
                    case when r.permissive then 'permissive' else 'restrictive' end,
                    v_cmd, v_roles);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end $$;
