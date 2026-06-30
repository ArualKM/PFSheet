-- Phase 9 (PFcore M12): linked-row companions (animal companion / familiar / eidolon / cohort).
-- A companion is a normal character owned by the same user (existing owner-based RLS covers it), linked to
-- its parent via parent_character_id. ON DELETE SET NULL so deleting a parent orphans (not deletes) companions.
alter table public.characters
  add column if not exists parent_character_id uuid references public.characters(id) on delete set null,
  add column if not exists companion_type text;

alter table public.characters
  drop constraint if exists characters_not_own_parent;
alter table public.characters
  add constraint characters_not_own_parent check (parent_character_id is null or parent_character_id <> id);

create index if not exists idx_characters_parent_character_id
  on public.characters(parent_character_id) where parent_character_id is not null;
