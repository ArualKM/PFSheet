-- 0014_fk_indexes.sql
-- Performance advisor (unindexed_foreign_keys): add covering indexes for every foreign
-- key that lacked one. Foreign keys without an index force sequential scans on the
-- referenced side for cascade checks and on joins/filters by the FK column. All purely
-- additive (IF NOT EXISTS) — no behavior change, fully reversible (DROP INDEX).

create index if not exists idx_audit_events_campaign_id
  on public.audit_events (campaign_id);

create index if not exists idx_campaign_characters_added_by
  on public.campaign_characters (added_by);

create index if not exists idx_campaign_characters_approved_snapshot_id
  on public.campaign_characters (approved_snapshot_id);

create index if not exists idx_character_collaborators_granted_by
  on public.character_collaborators (granted_by);

create index if not exists idx_character_comments_author_id
  on public.character_comments (author_id);

create index if not exists idx_character_comments_campaign_id
  on public.character_comments (campaign_id);

create index if not exists idx_character_snapshots_created_by
  on public.character_snapshots (created_by);

create index if not exists idx_content_packs_owner_id
  on public.content_packs (owner_id);

create index if not exists idx_export_jobs_character_id
  on public.export_jobs (character_id);

create index if not exists idx_gm_notes_author_id
  on public.gm_notes (author_id);

create index if not exists idx_gm_notes_campaign_id
  on public.gm_notes (campaign_id);

create index if not exists idx_gm_reviews_reviewer_id
  on public.gm_reviews (reviewer_id);

create index if not exists idx_import_jobs_character_id
  on public.import_jobs (character_id);

create index if not exists idx_rule_modules_content_pack_id
  on public.rule_modules (content_pack_id);

create index if not exists idx_share_links_created_by
  on public.share_links (created_by);
