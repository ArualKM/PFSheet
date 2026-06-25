-- PathForge security layer (§5): RLS helper functions, triggers, and policies.
-- The non-negotiable rule: a GM can view/audit/comment but can NEVER modify a
-- player's canonical character unless granted editor/co_owner access.

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers. They run as the function owner and therefore read
-- the underlying tables bypassing RLS, which prevents policy recursion.
-- ---------------------------------------------------------------------------
create or replace function public.is_character_owner(p_character_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character_id and c.owner_id = p_user_id
  );
$$;

create or replace function public.has_character_any_role(p_character_id uuid, p_user_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.character_collaborators cc
    where cc.character_id = p_character_id and cc.user_id = p_user_id and cc.role = any(p_roles)
  );
$$;

create or replace function public.has_character_role(p_character_id uuid, p_user_id uuid, p_role text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_character_any_role(p_character_id, p_user_id, array[p_role]);
$$;

create or replace function public.is_campaign_member(p_campaign_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign_id and cm.user_id = p_user_id and cm.status = 'active'
  );
$$;

create or replace function public.has_campaign_role(p_campaign_id uuid, p_user_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign_id and cm.user_id = p_user_id
      and cm.status = 'active' and cm.role = any(p_roles)
  );
$$;

-- A user can view a character if they own it, collaborate on it, it is public,
-- or it is attached to a campaign they actively belong to with campaign visibility.
create or replace function public.can_view_character(p_character_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character_id
      and (
        c.visibility = 'public'
        or (p_user_id is not null and c.owner_id = p_user_id)
        or (p_user_id is not null and public.has_character_any_role(
              p_character_id, p_user_id, array['viewer','commenter','co_owner','editor']))
        or (
          p_user_id is not null and c.visibility = 'campaign' and exists (
            select 1 from public.campaign_characters cc
            join public.campaign_members cm on cm.campaign_id = cc.campaign_id
            where cc.character_id = c.id and cm.user_id = p_user_id and cm.status = 'active'
          )
        )
      )
  );
$$;

-- A user can edit a character ONLY as owner, co_owner, or explicit editor.
-- Campaign role alone never grants edit.
create or replace function public.can_edit_character(p_character_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_user_id is not null and (
    public.is_character_owner(p_character_id, p_user_id)
    or public.has_character_any_role(p_character_id, p_user_id, array['co_owner','editor'])
  );
$$;

create or replace function public.can_gm_review_character(p_character_id uuid, p_campaign_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.campaign_characters cc
    where cc.character_id = p_character_id and cc.campaign_id = p_campaign_id
  ) and public.has_campaign_role(p_campaign_id, p_user_id, array['owner','gm','assistant_gm']);
$$;

grant execute on function
  public.is_character_owner(uuid, uuid),
  public.has_character_any_role(uuid, uuid, text[]),
  public.has_character_role(uuid, uuid, text),
  public.is_campaign_member(uuid, uuid),
  public.has_campaign_role(uuid, uuid, text[]),
  public.can_view_character(uuid, uuid),
  public.can_edit_character(uuid, uuid),
  public.can_gm_review_character(uuid, uuid, uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a new auth user signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Protect character ownership: only the current owner may transfer ownership.
-- ---------------------------------------------------------------------------
create or replace function public.protect_character_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.owner_id is distinct from old.owner_id and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the owner may transfer character ownership';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_owner on public.characters;
create trigger protect_owner
  before update on public.characters
  for each row execute function public.protect_character_owner();

-- ---------------------------------------------------------------------------
-- Enable RLS on every new table.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','characters','character_collaborators','campaigns','campaign_members',
    'campaign_characters','character_snapshots','gm_reviews','gm_notes','character_comments',
    'audit_events','share_links','content_packs','rule_modules','import_jobs','export_jobs','api_keys'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------------
create policy "characters_select" on public.characters
  for select using (public.can_view_character(id, auth.uid()));
create policy "characters_insert_own" on public.characters
  for insert to authenticated with check (owner_id = auth.uid());
create policy "characters_update_editor" on public.characters
  for update to authenticated
  using (public.can_edit_character(id, auth.uid()))
  with check (public.can_edit_character(id, auth.uid()));
create policy "characters_delete_owner" on public.characters
  for delete to authenticated using (public.is_character_owner(id, auth.uid()));

-- ---------------------------------------------------------------------------
-- character_collaborators
-- ---------------------------------------------------------------------------
create policy "collab_select" on public.character_collaborators
  for select to authenticated
  using (public.is_character_owner(character_id, auth.uid()) or user_id = auth.uid());
create policy "collab_insert_owner" on public.character_collaborators
  for insert to authenticated
  with check (public.has_character_any_role(character_id, auth.uid(), array['co_owner'])
              or public.is_character_owner(character_id, auth.uid()));
create policy "collab_update_owner" on public.character_collaborators
  for update to authenticated
  using (public.is_character_owner(character_id, auth.uid()))
  with check (public.is_character_owner(character_id, auth.uid()));
create policy "collab_delete" on public.character_collaborators
  for delete to authenticated
  using (public.is_character_owner(character_id, auth.uid()) or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create policy "campaigns_select" on public.campaigns
  for select to authenticated
  using (owner_id = auth.uid() or public.is_campaign_member(id, auth.uid()));
create policy "campaigns_insert_own" on public.campaigns
  for insert to authenticated with check (owner_id = auth.uid());
create policy "campaigns_update_gm" on public.campaigns
  for update to authenticated
  using (owner_id = auth.uid() or public.has_campaign_role(id, auth.uid(), array['owner','gm']))
  with check (owner_id = auth.uid() or public.has_campaign_role(id, auth.uid(), array['owner','gm']));
create policy "campaigns_delete_owner" on public.campaigns
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- campaign_members
-- ---------------------------------------------------------------------------
create policy "members_select" on public.campaign_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_campaign_member(campaign_id, auth.uid())
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
create policy "members_insert_gm" on public.campaign_members
  for insert to authenticated
  with check (
    public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm'])
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
create policy "members_update_gm" on public.campaign_members
  for update to authenticated
  using (public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm'])
         or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
create policy "members_delete_gm" on public.campaign_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm'])
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- campaign_characters
-- ---------------------------------------------------------------------------
create policy "campchar_select" on public.campaign_characters
  for select to authenticated
  using (public.is_campaign_member(campaign_id, auth.uid())
         or public.is_character_owner(character_id, auth.uid()));
create policy "campchar_insert" on public.campaign_characters
  for insert to authenticated
  with check (public.is_character_owner(character_id, auth.uid())
              or public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm','assistant_gm']));
create policy "campchar_update" on public.campaign_characters
  for update to authenticated
  using (public.is_character_owner(character_id, auth.uid())
         or public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm','assistant_gm']));
create policy "campchar_delete" on public.campaign_characters
  for delete to authenticated
  using (public.is_character_owner(character_id, auth.uid())
         or public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm','assistant_gm']));

-- ---------------------------------------------------------------------------
-- character_snapshots
-- ---------------------------------------------------------------------------
create policy "snapshots_select" on public.character_snapshots
  for select using (public.can_view_character(character_id, auth.uid()));
create policy "snapshots_insert_editor" on public.character_snapshots
  for insert to authenticated with check (public.can_edit_character(character_id, auth.uid()));
create policy "snapshots_delete_owner" on public.character_snapshots
  for delete to authenticated using (public.is_character_owner(character_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- gm_reviews — GM writes their own reviews; player can read reviews of their sheet.
-- ---------------------------------------------------------------------------
create policy "reviews_select" on public.gm_reviews
  for select to authenticated
  using (public.is_campaign_member(campaign_id, auth.uid())
         or public.is_character_owner(character_id, auth.uid()));
create policy "reviews_insert_gm" on public.gm_reviews
  for insert to authenticated
  with check (reviewer_id = auth.uid()
              and public.can_gm_review_character(character_id, campaign_id, auth.uid()));
create policy "reviews_update_gm" on public.gm_reviews
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());
create policy "reviews_delete_gm" on public.gm_reviews
  for delete to authenticated using (reviewer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- gm_notes — visibility-aware reads; only GMs author.
-- ---------------------------------------------------------------------------
create policy "notes_select" on public.gm_notes
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm','assistant_gm'])
    or (visibility = 'player_visible' and public.is_character_owner(character_id, auth.uid()))
    or (visibility = 'party_visible' and public.is_campaign_member(campaign_id, auth.uid()))
  );
create policy "notes_insert_gm" on public.gm_notes
  for insert to authenticated
  with check (author_id = auth.uid()
              and public.can_gm_review_character(character_id, campaign_id, auth.uid()));
create policy "notes_update_author" on public.gm_notes
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "notes_delete_author" on public.gm_notes
  for delete to authenticated using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- character_comments
-- ---------------------------------------------------------------------------
create policy "comments_select" on public.character_comments
  for select to authenticated
  using (public.can_view_character(character_id, auth.uid())
         or (campaign_id is not null and public.is_campaign_member(campaign_id, auth.uid())));
create policy "comments_insert" on public.character_comments
  for insert to authenticated
  with check (author_id = auth.uid()
              and (public.can_view_character(character_id, auth.uid())
                   or (campaign_id is not null and public.is_campaign_member(campaign_id, auth.uid()))));
create policy "comments_update" on public.character_comments
  for update to authenticated
  using (author_id = auth.uid() or public.is_character_owner(character_id, auth.uid()))
  with check (author_id = auth.uid() or public.is_character_owner(character_id, auth.uid()));
create policy "comments_delete" on public.character_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_character_owner(character_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- audit_events — append-only; readable by owner / campaign GM / the actor.
-- ---------------------------------------------------------------------------
create policy "audit_select" on public.audit_events
  for select to authenticated
  using (
    actor_id = auth.uid()
    or (character_id is not null and public.is_character_owner(character_id, auth.uid()))
    or (campaign_id is not null and public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm','assistant_gm']))
  );
create policy "audit_insert_self" on public.audit_events
  for insert to authenticated with check (actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- share_links — managed by the character owner/co_owner. Token validation is
-- performed server-side with the service role, not via anon RLS.
-- ---------------------------------------------------------------------------
create policy "share_select" on public.share_links
  for select to authenticated using (public.can_edit_character(character_id, auth.uid()));
create policy "share_insert" on public.share_links
  for insert to authenticated with check (public.can_edit_character(character_id, auth.uid()));
create policy "share_update" on public.share_links
  for update to authenticated
  using (public.can_edit_character(character_id, auth.uid()))
  with check (public.can_edit_character(character_id, auth.uid()));
create policy "share_delete_owner" on public.share_links
  for delete to authenticated using (public.is_character_owner(character_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- content_packs / rule_modules
-- ---------------------------------------------------------------------------
create policy "packs_select" on public.content_packs
  for select using (status = 'published' or owner_id = auth.uid());
create policy "packs_insert" on public.content_packs
  for insert to authenticated with check (owner_id = auth.uid());
create policy "packs_update" on public.content_packs
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "packs_delete" on public.content_packs
  for delete to authenticated using (owner_id = auth.uid());

create policy "modules_select" on public.rule_modules
  for select using (
    content_pack_id is null
    or exists (select 1 from public.content_packs p
               where p.id = content_pack_id and (p.status = 'published' or p.owner_id = auth.uid()))
  );
create policy "modules_write" on public.rule_modules
  for all to authenticated
  using (exists (select 1 from public.content_packs p where p.id = content_pack_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.content_packs p where p.id = content_pack_id and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- import_jobs / export_jobs / api_keys — strictly owner-scoped.
-- ---------------------------------------------------------------------------
create policy "imports_all" on public.import_jobs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "exports_all" on public.export_jobs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "apikeys_all" on public.api_keys
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
