-- 0018_sphere_compendium.sql
-- Spheres of Power / Might / Guile reference data (Drop Dead Studios 3pp, sourced from the Spheres
-- community wiki; each row carries a `source` citation). Six normalized reference tables mirroring the
-- spell_compendium contract: public-read, writes service-role only, full-text search where it matters.
-- Data is seeded separately (one-time import), not carried in this migration. Powers the Spheres
-- compendium browser + (later) the Spheres character system's talent/tradition pickers.

-- The 68 spheres (Magic / Combat / Skill).
create table if not exists public.sphere_compendium (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system text not null default 'Magic',
  base_description text default ''::text,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, COALESCE(name, ''::text)), 'A'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(system, ''::text)), 'B'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(base_description, ''::text)), 'C'::"char")
  ) stored,
  created_at timestamptz default now()
);
create index if not exists idx_sphere_compendium_search on public.sphere_compendium using gin (search_vector);
create index if not exists idx_sphere_compendium_system on public.sphere_compendium using btree (system);
create index if not exists idx_sphere_compendium_name on public.sphere_compendium using btree (name);

-- ~3,938 talents across all spheres.
create table if not exists public.sphere_talents (
  id uuid primary key default gen_random_uuid(),
  sphere_name text not null,
  talent_name text not null,
  talent_category text default ''::text,
  subcategory text default ''::text,
  source text default ''::text,
  tags text default ''::text,
  prerequisites text default ''::text,
  base_cost text default ''::text,
  description text default ''::text,
  augments text default ''::text,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, COALESCE(talent_name, ''::text)), 'A'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(sphere_name, ''::text)), 'B'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'C'::"char")
  ) stored,
  created_at timestamptz default now()
);
create index if not exists idx_sphere_talents_search on public.sphere_talents using gin (search_vector);
create index if not exists idx_sphere_talents_sphere on public.sphere_talents using btree (sphere_name);
create index if not exists idx_sphere_talents_category on public.sphere_talents using btree (talent_category);

-- 225 traditions (Casting / Martial / Trade / Unified / Tinker).
create table if not exists public.sphere_traditions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default ''::text,
  source text default ''::text,
  drawbacks_gained text default ''::text,
  boons_gained text default ''::text,
  description text default ''::text,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, COALESCE(name, ''::text)), 'A'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(type, ''::text)), 'B'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'C'::"char")
  ) stored,
  created_at timestamptz default now()
);
create index if not exists idx_sphere_traditions_search on public.sphere_traditions using gin (search_vector);
create index if not exists idx_sphere_traditions_type on public.sphere_traditions using btree (type);

-- 489 drawbacks.
create table if not exists public.sphere_drawbacks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sphere text default ''::text,
  system text default ''::text,
  tradition text default ''::text,
  source text default ''::text,
  prerequisites text default ''::text,
  description text default ''::text,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, COALESCE(name, ''::text)), 'A'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'C'::"char")
  ) stored,
  created_at timestamptz default now()
);
create index if not exists idx_sphere_drawbacks_search on public.sphere_drawbacks using gin (search_vector);
create index if not exists idx_sphere_drawbacks_tradition on public.sphere_drawbacks using btree (tradition);

-- 29 boons.
create table if not exists public.sphere_boons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system text default ''::text,
  tradition text default ''::text,
  source text default ''::text,
  description text default ''::text,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, COALESCE(name, ''::text)), 'A'::"char") ||
    setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'C'::"char")
  ) stored,
  created_at timestamptz default now()
);
create index if not exists idx_sphere_boons_search on public.sphere_boons using gin (search_vector);

-- 20 reference tables (each json_data is an array of row objects).
create table if not exists public.sphere_rules_tables (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  json_data jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- RLS: everyone can read the reference data; only the service role may modify it.
alter table public.sphere_compendium enable row level security;
alter table public.sphere_talents enable row level security;
alter table public.sphere_traditions enable row level security;
alter table public.sphere_drawbacks enable row level security;
alter table public.sphere_boons enable row level security;
alter table public.sphere_rules_tables enable row level security;

create policy "Spheres are readable by everyone" on public.sphere_compendium for select using (true);
create policy "Only service role can modify spheres" on public.sphere_compendium for all using ((select auth.role()) = 'service_role');
create policy "Sphere talents are readable by everyone" on public.sphere_talents for select using (true);
create policy "Only service role can modify sphere talents" on public.sphere_talents for all using ((select auth.role()) = 'service_role');
create policy "Sphere traditions are readable by everyone" on public.sphere_traditions for select using (true);
create policy "Only service role can modify sphere traditions" on public.sphere_traditions for all using ((select auth.role()) = 'service_role');
create policy "Sphere drawbacks are readable by everyone" on public.sphere_drawbacks for select using (true);
create policy "Only service role can modify sphere drawbacks" on public.sphere_drawbacks for all using ((select auth.role()) = 'service_role');
create policy "Sphere boons are readable by everyone" on public.sphere_boons for select using (true);
create policy "Only service role can modify sphere boons" on public.sphere_boons for all using ((select auth.role()) = 'service_role');
create policy "Sphere rules tables are readable by everyone" on public.sphere_rules_tables for select using (true);
create policy "Only service role can modify sphere rules tables" on public.sphere_rules_tables for all using ((select auth.role()) = 'service_role');
