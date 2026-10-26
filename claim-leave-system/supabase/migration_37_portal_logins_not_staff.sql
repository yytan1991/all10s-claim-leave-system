-- =========================================================
-- ALL10S ERP / WiiTeam — Portal logins are not staff (migration 37)
--
-- The existing handle_new_user() trigger gives EVERY new login a staff profile
-- in the first organisation. That included parent logins (created at first
-- email-code login) and student logins (internal @student.portal.internal
-- addresses), so they could sign in to the staff site.
--
-- This keeps the original behaviour for everyone else (staff creation is
-- unchanged) and simply skips portal logins.
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
begin
  -- Parent / student portal logins are not staff: no staff profile.
  if new.email like '%@student.portal.internal'
     or new.raw_user_meta_data->>'portal' in ('parent', 'student') then
    return new;
  end if;

  v_org_id := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  if v_org_id is null then
    select id into v_org_id from public.organizations order by created_at limit 1;
  end if;

  insert into public.profiles (id, user_id, full_name, email, org_id)
  values (gen_random_uuid(), new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, v_org_id);

  return new;
end;
$function$;
