-- M9: bound api_rate_limits growth. The fixed-window limiter inserts one row per
-- (bucket, window); without cleanup the table grows forever. Add an index on
-- window_start and have check_rate_limit opportunistically prune stale windows on
-- the first hit of each new window (so no cron/edge function is required).
create index if not exists api_rate_limits_window_idx on public.api_rate_limits (window_start);

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
  -- First hit of a new window for this bucket → prune windows older than an hour.
  if v_count = 1 then
    delete from public.api_rate_limits where window_start < now() - interval '1 hour';
  end if;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
revoke all on function public.check_rate_limit(text, integer, integer) from anon, authenticated;
