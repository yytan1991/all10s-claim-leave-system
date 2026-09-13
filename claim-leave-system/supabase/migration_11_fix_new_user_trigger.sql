-- =========================================================
-- ALL10S ERP — Fix "Database error creating new user" (migration 11)
--
-- Supabase's auth service runs the new-user trigger in a context
-- where uuid_generate_v4() (from the uuid-ossp extension) isn't
-- always resolvable, causing invites to fail with a generic
-- "Database error creating new user". gen_random_uuid() is built
-- into Postgres itself and doesn't have this problem.
-- =========================================================

create or replace function handle_new_user()
returns trigger as $$
declare
  v_org_id uuid;
begin
  v_org_id := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  if v_org_id is null then
    select id into v_org_id from organizations where name = 'ALL10S EDU' limit 1;
  end if;
  insert into public.profiles (id, user_id, full_name, email, org_id)
  values (gen_random_uuid(), new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, v_org_id);
  return new;
end;
$$ language plpgsql security definer;
