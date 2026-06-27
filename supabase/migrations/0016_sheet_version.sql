-- 0016_sheet_version.sql
-- S5b Phase 1: optimistic concurrency for character saves. Today saveCharacterSheetAction
-- does an unconditional whole-sheet_data overwrite, so a second device's save silently
-- clobbers the first. This adds a monotonic version the client carries as its "base", so a
-- compare-and-swap UPDATE (... WHERE sheet_version = expected) misses when someone else has
-- saved in the meantime — surfacing a conflict the app resolves with the 3-way merge instead
-- of losing data.
--
-- Additive + safe: a new column defaulting to 1 on every existing row, plus a trigger that
-- bumps it only when sheet_data actually changes. No RLS / behavior change to reads. The
-- trigger function is plain SECURITY INVOKER (it references trigger NEW/OLD, so calling it
-- directly is a harmless no-op error) so it adds no security-advisor surface.

alter table public.characters
  add column if not exists sheet_version bigint not null default 1;

create or replace function public.bump_sheet_version()
returns trigger
language plpgsql
as $$
begin
  -- Only count a real content change; metadata-only updates (visibility, slug, archive,
  -- stale flag, …) must not advance the edit version or they'd cause phantom conflicts.
  if new.sheet_data is distinct from old.sheet_data then
    new.sheet_version := old.sheet_version + 1;
  else
    new.sheet_version := old.sheet_version;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_sheet_version on public.characters;
create trigger trg_bump_sheet_version
  before update on public.characters
  for each row execute function public.bump_sheet_version();
