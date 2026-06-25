-- Root-cause fix for "new row violates row-level security policy for table
-- characters" on every character create.
--
-- The characters SELECT policy relied solely on can_view_character(id, auth.uid()),
-- a SECURITY DEFINER function that RE-QUERIES public.characters by id. PostgREST
-- issues an INSERT ... RETURNING for the app's .insert().select() call; during that
-- statement the just-inserted row is not yet visible to the function's fresh
-- snapshot, so the policy returned false and the owner could not read back their
-- own new row. Postgres reports that as an RLS violation on INSERT.
--
-- A plain INSERT (return=minimal) always worked — only the representation/RETURNING
-- path failed, which is exactly what .select() after .insert() triggers.
--
-- Fix: check the row's own owner_id directly (a column predicate is always visible
-- in RETURNING), then fall back to can_view_character for the public / collaborator
-- / campaign visibility cases.
drop policy if exists "characters_select" on public.characters;
create policy "characters_select" on public.characters
  for select using (
    (auth.uid() is not null and owner_id = auth.uid())
    or public.can_view_character(id, auth.uid())
  );
