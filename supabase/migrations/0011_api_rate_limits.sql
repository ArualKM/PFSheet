-- M9 §14.5: simple fixed-window API rate limiting. A single atomic upsert per
-- request increments the counter for the current window and returns whether the
-- caller is still under the limit. Only the service role (admin client) touches
-- this — there are no RLS policies and the function's EXECUTE is revoked from
-- anon/authenticated so it can't be called via PostgREST.
create table if not exists public.api_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.api_rate_limits enable row level security;

create or replace function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.api_rate_limits (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
    do update set count = public.api_rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
revoke all on function public.check_rate_limit(text, integer, integer) from anon, authenticated;
