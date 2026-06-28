-- 0017_bump_sheet_version_search_path.sql
-- Clear the function_search_path_mutable advisor WARN that 0016 introduced. The trigger function
-- only references NEW/OLD and a pg_catalog operator (`is distinct from`), so an empty search_path is
-- behavior-identical — same hardening the 0015 pass applied to the other functions.
alter function public.bump_sheet_version() set search_path = '';
