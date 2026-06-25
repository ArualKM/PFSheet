-- The Pathfinder 1e spell compendium (~3,034 spells), preserved from the original
-- PathForge database. Powers /spells and spellcasting. Public-read; writes are
-- service-role only. The data itself is seeded separately (one-time import), not
-- carried in this migration.
create table if not exists public.spell_compendium (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text not null default 'Universal',
  subschool text default ''::text,
  descriptor text default ''::text,
  class_levels jsonb not null default '{}'::jsonb,
  domain_levels jsonb default '{}'::jsonb,
  bloodline_levels jsonb default '{}'::jsonb,
  casting_time text default '1 standard action'::text,
  components text default ''::text,
  range text default ''::text,
  area text default ''::text,
  effect text default ''::text,
  targets text default ''::text,
  duration text default ''::text,
  saving_throw text default 'none'::text,
  spell_resistance text default 'no'::text,
  description text default ''::text,
  source text default 'Core Rulebook'::text,
  search_vector tsvector generated always as (
    (setweight(to_tsvector('english'::regconfig, COALESCE(name, ''::text)), 'A'::"char") ||
     setweight(to_tsvector('english'::regconfig, COALESCE(school, ''::text)), 'B'::"char")) ||
    setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'C'::"char")
  ) stored,
  created_at timestamptz default now()
);

create index if not exists idx_spell_compendium_search on public.spell_compendium using gin (search_vector);
create index if not exists idx_spell_compendium_school on public.spell_compendium using btree (school);
create index if not exists idx_spell_compendium_name on public.spell_compendium using btree (name);
create index if not exists idx_spell_compendium_class_levels on public.spell_compendium using gin (class_levels);

alter table public.spell_compendium enable row level security;

create policy "Spell compendium is readable by everyone" on public.spell_compendium
  for select using (true);
create policy "Only service role can modify spell compendium" on public.spell_compendium
  for all using (auth.role() = 'service_role');
