-- RLS hardening from the foundation security review.

-- 1. Defense-in-depth ownership lock: no authenticated client may change a
--    character's owner_id at all (the column-level privilege is revoked). The
--    protect_character_owner trigger remains as a second layer. Ownership
--    transfer, when added, will be a service-role server operation.
revoke update (owner_id) on public.characters from authenticated;

-- 2. campaign_members: a non-owner GM must not be able to mint or elevate a
--    member to the 'owner' role. Only the campaign owner may assign role='owner'.
drop policy if exists "members_insert_gm" on public.campaign_members;
create policy "members_insert_gm" on public.campaign_members
  for insert to authenticated
  with check (
    (public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm'])
     or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
    and (role <> 'owner'
         or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
  );

drop policy if exists "members_update_gm" on public.campaign_members;
create policy "members_update_gm" on public.campaign_members
  for update to authenticated
  using (
    public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm'])
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  )
  with check (
    (public.has_campaign_role(campaign_id, auth.uid(), array['owner','gm'])
     or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
    and (role <> 'owner'
         or exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
  );

-- 3. GM reviews/notes: editing must still require an active GM role on the
--    campaign (not merely having authored the row while previously a GM).
drop policy if exists "reviews_update_gm" on public.gm_reviews;
create policy "reviews_update_gm" on public.gm_reviews
  for update to authenticated
  using (reviewer_id = auth.uid()
         and public.can_gm_review_character(character_id, campaign_id, auth.uid()))
  with check (reviewer_id = auth.uid()
              and public.can_gm_review_character(character_id, campaign_id, auth.uid()));

drop policy if exists "notes_update_author" on public.gm_notes;
create policy "notes_update_author" on public.gm_notes
  for update to authenticated
  using (author_id = auth.uid()
         and public.can_gm_review_character(character_id, campaign_id, auth.uid()))
  with check (author_id = auth.uid()
              and public.can_gm_review_character(character_id, campaign_id, auth.uid()));
