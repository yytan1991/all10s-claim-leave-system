-- =========================================================
-- ALL10S ERP — Fix new-user org fallback (migration 18)
--
-- handle_new_user() previously fell back to an org matched by the
-- exact name 'ALL10S EDU'. Once that org gets renamed (as it has),
-- the lookup silently finds nothing and new user creation fails
-- with a check-constraint violation. Falls back to the oldest
-- organization instead, which survives renames.
-- =========================================================

create or replace function handle_new_user()
returns trigger as $$
declare
  v_org_id uuid;
begin
  v_org_id := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  if v_org_id is null then
    select id into v_org_id from public.organizations order by created_at limit 1;
  end if;

  insert into public.profiles (id, user_id, full_name, email, org_id)
  values (gen_random_uuid(), new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, v_org_id);

  return new;
end;
$$ language plpgsql security definer
set search_path = public;
