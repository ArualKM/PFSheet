-- Cleanup of orphaned functions left over from the previous database, plus
-- security hardening of function search_path and EXECUTE grants (addresses
-- Supabase advisors 0011/0028/0029).

-- 1. Drop orphaned functions from the old schema (no dependent triggers).
drop function if exists public.is_campaign_gm(uuid, uuid);
drop function if exists public.is_member_of_campaign(uuid);
drop function if exists public.update_updated_at();

-- 2. Pin search_path on the generic updated_at trigger function.
alter function public.set_updated_at() set search_path = public, pg_temp;

-- 3. Trigger functions are invoked by the trigger mechanism, never by clients.
--    Revoke all direct EXECUTE so they are not exposed as RPC endpoints.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_character_owner() from public, anon, authenticated;

-- 4. RLS helper functions are SECURITY DEFINER and only need to be callable by
--    the roles whose policies reference them. Only can_view_character is used by
--    a policy that applies to anonymous visitors (public character viewing).
revoke execute on function
  public.is_character_owner(uuid, uuid),
  public.has_character_any_role(uuid, uuid, text[]),
  public.has_character_role(uuid, uuid, text),
  public.is_campaign_member(uuid, uuid),
  public.has_campaign_role(uuid, uuid, text[]),
  public.can_view_character(uuid, uuid),
  public.can_edit_character(uuid, uuid),
  public.can_gm_review_character(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.can_view_character(uuid, uuid) to anon, authenticated;

grant execute on function
  public.is_character_owner(uuid, uuid),
  public.has_character_any_role(uuid, uuid, text[]),
  public.has_character_role(uuid, uuid, text),
  public.is_campaign_member(uuid, uuid),
  public.has_campaign_role(uuid, uuid, text[]),
  public.can_edit_character(uuid, uuid),
  public.can_gm_review_character(uuid, uuid, uuid)
to authenticated;
