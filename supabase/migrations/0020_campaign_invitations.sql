-- Campaign invitations / consent (§17). Previously inviteMemberAction force-added
-- a player as status='active' with no consent. The schema always carried a `status`
-- column (default 'active'); this migration makes 'invited' a first-class pending
-- state and grants an invited user the ability to ACCEPT (own row invited→active)
-- or DECLINE (delete own invited row) — and NOTHING else.
--
-- Access-control invariants (the privacy contract of this change):
--   * is_campaign_member() / has_campaign_role() already require status='active'
--     (migration 0002), so an 'invited' row grants ZERO access: the campaign is
--     not readable (campaigns_select), no GM check passes, and the campaign does
--     not appear in the invitee's campaigns list. Access begins only on accept.
--   * members_select already lets a user read their OWN row (user_id = auth.uid()),
--     which is what surfaces the pending invitation to the invitee.
--   * members_delete_gm already lets a user delete their OWN row, which is the
--     decline path (the action scopes the delete to status='invited').
-- The only missing capability was UPDATE of one's own row to accept — added below,
-- fenced so it can ONLY ever be a clean accept.

-- ---------------------------------------------------------------------------
-- 1. Lock the status domain. Only 'active' rows exist today, so this is safe.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.campaign_members'::regclass
      and conname = 'campaign_members_status_check'
  ) then
    alter table public.campaign_members
      add constraint campaign_members_status_check
      check (status in ('active','invited'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Self-accept RLS policy. USING restricts WHICH rows the invitee may touch
--    (only their OWN pending row); WITH CHECK constrains the result (still their
--    own row, now active). RLS cannot compare OLD vs NEW columns, so role /
--    campaign_id / user_id are pinned by the trigger in step 3 — that trigger is
--    the escalation guard, and the only change this policy + trigger together
--    permit is the status flip invited→active. (auth.uid() is wrapped in a scalar
--    subquery to match the 0015 initplan optimization applied to every other policy.)
--
--    NOTE: an earlier draft also put `role not in ('owner','gm','assistant_gm')`
--    here as a second layer, but that contradicts the trigger's "role is
--    unchanged" rule for any invite not at role='player' (e.g. inviting someone
--    directly as a co-GM), permanently wedging acceptance. The trigger alone fully
--    prevents an invitee from escalating their own role, so the clause is dropped.
-- ---------------------------------------------------------------------------
drop policy if exists "members_accept_self" on public.campaign_members;
create policy "members_accept_self" on public.campaign_members
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and status = 'invited'
  )
  with check (
    user_id = (select auth.uid())
    and status = 'active'
  );

-- ---------------------------------------------------------------------------
-- 3. Trigger guard. A self-update of a *pending* row may ONLY flip status to
--    'active'; it may not change campaign_id, user_id, or role. This is the real
--    escalation guard — without it, an invitee could repoint campaign_id to a
--    campaign they were never invited to (joining it as active) or set a
--    privileged role, since WITH CHECK only sees the NEW row.
--
--    Fires ONLY when the actor edits their own currently-invited row, so it never
--    interferes with GM management (a GM editing a member's row has
--    auth.uid() <> old.user_id) nor with active members (old.status <> 'invited').
--
--    SECURITY INVOKER + NO execute revoke, matching the bump_sheet_version trigger
--    (0016/0017): the function only touches NEW/OLD + auth.uid() (no table access),
--    so it needs no elevated rights, and the default PUBLIC execute MUST remain so
--    the trigger can fire for the `authenticated` role's UPDATEs. Revoking it from
--    authenticated would silently break every campaign_members UPDATE — the exact
--    regression migrations 0003→0005 had to undo. search_path is pinned to satisfy
--    the function_search_path_mutable advisor; calling the fn directly as an RPC is
--    a harmless no-op error (it dereferences trigger NEW/OLD).
-- ---------------------------------------------------------------------------
create or replace function public.protect_member_self_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) = old.user_id and old.status = 'invited' then
    if new.status <> 'active'
       or new.role is distinct from old.role
       or new.campaign_id is distinct from old.campaign_id
       or new.user_id is distinct from old.user_id then
      raise exception
        'A pending invitation may only be accepted (status set to active); role and campaign are fixed'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_member_self_update on public.campaign_members;
create trigger protect_member_self_update
  before update on public.campaign_members
  for each row execute function public.protect_member_self_update();
