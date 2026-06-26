-- M7 addendum: roster archiving (§17). A campaign character can be ARCHIVED
-- (dead PC, player on break, retired, player left) instead of removed from the
-- roster, so its review status, review history, and approved-snapshot link are
-- retained. `archived_at IS NULL` means active. The GM (or the character owner)
-- may archive/restore via the existing campchar_update RLS policy; no new policy
-- is required. The GM can still permanently remove from the archived list.
alter table public.campaign_characters
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text
    check (archive_reason is null or archive_reason in ('dead', 'on_break', 'retired', 'left', 'other'));

-- Partial index for the common "active roster" read.
create index if not exists campaign_characters_active_idx
  on public.campaign_characters (campaign_id)
  where archived_at is null;
