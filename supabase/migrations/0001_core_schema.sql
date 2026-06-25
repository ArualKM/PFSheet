-- PathForge core schema (§4). Additive: does NOT touch the existing
-- public.spell_compendium table, which is preserved as-is.

create extension if not exists pgcrypto;

-- Generic updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  handle text unique,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  public_slug text unique,
  name text not null default 'New Character',
  system_key text not null default 'pf1e',
  schema_version text not null default 'pathforge-character-v1',
  visibility text not null default 'private'
    check (visibility in ('private','campaign','unlisted','public')),
  sheet_data jsonb not null,
  computed_summary jsonb not null default '{}'::jsonb,
  computed_values jsonb not null default '{}'::jsonb,
  privacy_map jsonb not null default '{}'::jsonb,
  enabled_modules jsonb not null default '[]'::jsonb,
  active_theme jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  last_calculated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists characters_owner_idx on public.characters(owner_id);
create index if not exists characters_visibility_idx on public.characters(visibility);

-- ---------------------------------------------------------------------------
-- character_collaborators
-- ---------------------------------------------------------------------------
create table if not exists public.character_collaborators (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('viewer','commenter','co_owner','editor')),
  granted_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique(character_id, user_id)
);
create index if not exists collaborators_user_idx on public.character_collaborators(user_id);
create index if not exists collaborators_character_idx on public.character_collaborators(character_id);

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  system_key text not null default 'pf1e',
  public_slug text unique,
  settings jsonb not null default '{}'::jsonb,
  enabled_modules jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists campaigns_owner_idx on public.campaigns(owner_id);

-- ---------------------------------------------------------------------------
-- campaign_members
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','gm','assistant_gm','player','viewer')),
  status text not null default 'active',
  created_at timestamptz default now(),
  unique(campaign_id, user_id)
);
create index if not exists campaign_members_user_idx on public.campaign_members(user_id);
create index if not exists campaign_members_campaign_idx on public.campaign_members(campaign_id);

-- ---------------------------------------------------------------------------
-- character_snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.character_snapshots (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  created_by uuid references public.profiles(id),
  label text not null,
  reason text,
  sheet_data jsonb not null,
  computed_summary jsonb not null default '{}'::jsonb,
  computed_values jsonb not null default '{}'::jsonb,
  diff_from_previous jsonb,
  created_at timestamptz default now()
);
create index if not exists snapshots_character_idx on public.character_snapshots(character_id);

-- ---------------------------------------------------------------------------
-- campaign_characters
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  added_by uuid references public.profiles(id),
  gm_review_status text not null default 'unreviewed'
    check (gm_review_status in ('unreviewed','in_review','changes_requested','approved',
      'approved_with_notes','rejected','stale_after_changes')),
  approved_snapshot_id uuid references public.character_snapshots(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(campaign_id, character_id)
);
create index if not exists campaign_characters_campaign_idx on public.campaign_characters(campaign_id);
create index if not exists campaign_characters_character_idx on public.campaign_characters(character_id);

-- ---------------------------------------------------------------------------
-- gm_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.gm_reviews (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  status text not null,
  checklist jsonb not null default '{}'::jsonb,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists gm_reviews_character_idx on public.gm_reviews(character_id);
create index if not exists gm_reviews_campaign_idx on public.gm_reviews(campaign_id);

-- ---------------------------------------------------------------------------
-- gm_notes
-- ---------------------------------------------------------------------------
create table if not exists public.gm_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  visibility text not null default 'gm_only'
    check (visibility in ('gm_only','player_visible','party_visible')),
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists gm_notes_character_idx on public.gm_notes(character_id);

-- ---------------------------------------------------------------------------
-- character_comments
-- ---------------------------------------------------------------------------
create table if not exists public.character_comments (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  target_path text,
  body text not null,
  status text not null default 'open'
    check (status in ('open','resolved','dismissed','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists comments_character_idx on public.character_comments(character_id);

-- ---------------------------------------------------------------------------
-- audit_events
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  character_id uuid references public.characters(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz default now()
);
create index if not exists audit_character_idx on public.audit_events(character_id);
create index if not exists audit_actor_idx on public.audit_events(actor_id);

-- ---------------------------------------------------------------------------
-- share_links
-- ---------------------------------------------------------------------------
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  token_hash text unique not null,
  slug text unique,
  label text,
  visibility_preset text not null default 'public_sheet'
    check (visibility_preset in ('public_sheet','party_sheet','gm_review','minimal_card','custom')),
  allowed_sections jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create index if not exists share_links_character_idx on public.share_links(character_id);

-- ---------------------------------------------------------------------------
-- content_packs / rule_modules
-- ---------------------------------------------------------------------------
create table if not exists public.content_packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id),
  key text not null unique,
  name text not null,
  publisher text,
  license text,
  system_key text not null default 'pf1e',
  version text not null,
  status text not null default 'draft'
    check (status in ('draft','private','published','deprecated','blocked')),
  manifest jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.rule_modules (
  id uuid primary key default gen_random_uuid(),
  content_pack_id uuid references public.content_packs(id) on delete cascade,
  key text not null unique,
  name text not null,
  description text,
  module_type text not null
    check (module_type in ('core','variant_rule','third_party','house_rule',
      'custom_sheet_extension','import_adapter','export_adapter')),
  manifest jsonb not null,
  conflicts jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- import_jobs / export_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  source_type text not null,
  status text not null default 'queued',
  original_filename text,
  source_metadata jsonb not null default '{}'::jsonb,
  mapping_preview jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists import_jobs_owner_idx on public.import_jobs(owner_id);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  export_type text not null,
  status text not null default 'queued',
  file_path text,
  metadata jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists export_jobs_owner_idx on public.export_jobs(owner_id);

-- ---------------------------------------------------------------------------
-- api_keys
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  key_hash text not null unique,
  scopes jsonb not null default '[]'::jsonb,
  allowed_character_ids jsonb not null default '[]'::jsonb,
  allowed_campaign_ids jsonb not null default '[]'::jsonb,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists api_keys_owner_idx on public.api_keys(owner_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','characters','campaigns','campaign_characters','gm_reviews','gm_notes',
    'character_comments','content_packs','rule_modules','import_jobs','export_jobs'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; '
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;
