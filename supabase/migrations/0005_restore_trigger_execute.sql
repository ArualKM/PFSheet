-- Migration 0003 over-revoked EXECUTE on the trigger functions, which silently
-- broke them: handle_new_user could not fire for GoTrue (supabase_auth_admin),
-- so new signups got no profile row; set_updated_at / protect_character_owner
-- could not fire for authenticated UPDATEs. Restore EXECUTE to exactly the roles
-- that invoke each trigger.
grant execute on function public.handle_new_user() to supabase_auth_admin, service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;
grant execute on function public.protect_character_owner() to authenticated, service_role;

-- Backfill profiles for users created while the trigger was broken.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
