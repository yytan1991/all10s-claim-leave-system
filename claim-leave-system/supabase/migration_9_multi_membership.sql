-- =========================================================
-- ALL10S ERP — Multi-company logins (migration 9)
--
-- Lets one email/login hold SEPARATE memberships (each with its
-- own organization and role) across more than one company or
-- branch — e.g. an admin at Branch A who is also staff at
-- Branch B, using one login and picking which one after signing in.
--
-- This replaces the old assumption that profiles.id always equals
-- auth.users.id (one person = exactly one org). Run AFTER
-- migration_8_multi_tenant.sql.
-- =========================================================

-- ---------- Decouple profiles from a strict 1:1 with auth.users ----------
alter table profiles add column if not exists user_id uuid;
update profiles set user_id = id where user_id is null;

alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles alter column user_id set not null;
alter table profiles drop constraint if exists profiles_user_id_fkey;
alter table profiles add constraint profiles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table profiles drop constraint if exists profiles_user_org_unique;
alter table profiles add constraint profiles_user_org_unique unique (user_id, org_id);

-- New signups still create exactly one membership row, same as before,
-- just now via user_id rather than forcing id = auth id.
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
  values (uuid_generate_v4(), new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, v_org_id);
  return new;
end;
$$ language plpgsql security definer;

-- =========================================================
-- New helper functions — checks are now scoped to a SPECIFIC org
-- (a row's own org_id), rather than a single "current org" per
-- login, since one login can now have a membership in several.
-- =========================================================
create or replace function owns_profile(p_profile_id uuid)
returns boolean as $$
  select exists (select 1 from profiles where id = p_profile_id and user_id = auth.uid());
$$ language sql security definer stable;

create or replace function has_profile_in_org(p_org_id uuid)
returns boolean as $$
  select exists (select 1 from profiles where user_id = auth.uid() and org_id = p_org_id);
$$ language sql security definer stable;

create or replace function is_org_manager_or_admin(p_org_id uuid)
returns boolean as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and org_id = p_org_id and role in ('manager', 'admin')
  );
$$ language sql security definer stable;

create or replace function is_org_admin(p_org_id uuid)
returns boolean as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and org_id = p_org_id and role = 'admin'
  );
$$ language sql security definer stable;

create or replace function is_superadmin()
returns boolean as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'superadmin');
$$ language sql security definer stable;

-- Looks up an existing login by email, for admins adding someone who
-- already has an account (at another branch) into their own org.
-- Restricted to admins/superadmins; returns only the id, nothing else.
create or replace function find_user_id_by_email(p_email text)
returns uuid as $$
  select case
    when is_superadmin() or exists (select 1 from profiles where user_id = auth.uid() and role = 'admin')
      then (select id from auth.users where lower(email) = lower(p_email) limit 1)
    else null
  end;
$$ language sql security definer stable;

-- The old single-org auto-fill trigger no longer applies — a login can
-- belong to more than one org, so org_id must now be supplied explicitly
-- by the app on every insert, matching whichever company is active.
drop trigger if exists trg_set_org_id on leave_types;
drop trigger if exists trg_set_org_id on leave_balances;
drop trigger if exists trg_set_org_id on leave_applications;
drop trigger if exists trg_set_org_id on claim_types;
drop trigger if exists trg_set_org_id on claims;
drop trigger if exists trg_set_org_id on work_locations;
drop trigger if exists trg_set_org_id on attendance_records;
drop trigger if exists trg_set_org_id on crm_stages;
drop trigger if exists trg_set_org_id on crm_contacts;
drop trigger if exists trg_set_org_id on crm_followups;

-- =========================================================
-- Rewrite every policy to check the SPECIFIC org/profile on each
-- row, rather than a single "my one org" assumption.
-- =========================================================

-- ---------- profiles ----------
drop policy if exists "profiles_select_own_or_manager" on profiles;
create policy "profiles_select_own_or_manager" on profiles
  for select using (
    user_id = auth.uid()
    or is_superadmin()
    or is_org_manager_or_admin(org_id)
  );

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (user_id = auth.uid());

drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles
  for update using (is_superadmin() or is_org_admin(org_id));

-- New: an org admin (or superadmin) can add a membership row for someone
-- who already has a login elsewhere, scoped to their own org only.
drop policy if exists "profiles_insert_admin" on profiles;
create policy "profiles_insert_admin" on profiles
  for insert with check (is_superadmin() or is_org_admin(org_id));

-- ---------- leave_types ----------
drop policy if exists "leave_types_read_all" on leave_types;
create policy "leave_types_read_all" on leave_types
  for select using (has_profile_in_org(org_id));

drop policy if exists "leave_types_admin_write" on leave_types;
create policy "leave_types_admin_write" on leave_types
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------- claim_types ----------
drop policy if exists "claim_types_read_all" on claim_types;
create policy "claim_types_read_all" on claim_types
  for select using (has_profile_in_org(org_id));

drop policy if exists "claim_types_admin_write" on claim_types;
create policy "claim_types_admin_write" on claim_types
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------- leave_balances ----------
drop policy if exists "leave_balances_select_own_or_manager" on leave_balances;
create policy "leave_balances_select_own_or_manager" on leave_balances
  for select using (owns_profile(profile_id) or is_org_manager_or_admin(org_id));

drop policy if exists "leave_balances_admin_write" on leave_balances;
create policy "leave_balances_admin_write" on leave_balances
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------- leave_applications ----------
drop policy if exists "leave_apps_select_own_or_manager" on leave_applications;
create policy "leave_apps_select_own_or_manager" on leave_applications
  for select using (owns_profile(profile_id) or is_org_manager_or_admin(org_id));

drop policy if exists "leave_apps_insert_own" on leave_applications;
create policy "leave_apps_insert_own" on leave_applications
  for insert with check (owns_profile(profile_id));

drop policy if exists "leave_apps_update_own_pending_cancel" on leave_applications;
create policy "leave_apps_update_own_pending_cancel" on leave_applications
  for update using (owns_profile(profile_id) and status = 'pending')
  with check (owns_profile(profile_id));

drop policy if exists "leave_apps_update_manager_decision" on leave_applications;
create policy "leave_apps_update_manager_decision" on leave_applications
  for update using (is_org_manager_or_admin(org_id))
  with check (is_org_manager_or_admin(org_id));

-- ---------- claims ----------
drop policy if exists "claims_select_own_or_manager" on claims;
create policy "claims_select_own_or_manager" on claims
  for select using (owns_profile(profile_id) or is_org_manager_or_admin(org_id));

drop policy if exists "claims_insert_own" on claims;
create policy "claims_insert_own" on claims
  for insert with check (owns_profile(profile_id));

drop policy if exists "claims_update_manager_decision" on claims;
create policy "claims_update_manager_decision" on claims
  for update using (is_org_manager_or_admin(org_id))
  with check (is_org_manager_or_admin(org_id));

-- ---------- work_locations ----------
drop policy if exists "work_locations_read_all" on work_locations;
create policy "work_locations_read_all" on work_locations
  for select using (has_profile_in_org(org_id));

drop policy if exists "work_locations_admin_write" on work_locations;
create policy "work_locations_admin_write" on work_locations
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------- attendance_records ----------
drop policy if exists "attendance_select_own_or_manager" on attendance_records;
create policy "attendance_select_own_or_manager" on attendance_records
  for select using (owns_profile(profile_id) or is_org_manager_or_admin(org_id));

drop policy if exists "attendance_insert_own" on attendance_records;
create policy "attendance_insert_own" on attendance_records
  for insert with check (owns_profile(profile_id));

drop policy if exists "attendance_update_own" on attendance_records;
create policy "attendance_update_own" on attendance_records
  for update using (owns_profile(profile_id))
  with check (owns_profile(profile_id));

drop policy if exists "attendance_admin_write" on attendance_records;
create policy "attendance_admin_write" on attendance_records
  for update using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "attendance_admin_insert" on attendance_records;
create policy "attendance_admin_insert" on attendance_records
  for insert with check (is_org_admin(org_id));

-- ---------- crm_stages ----------
drop policy if exists "crm_stages_read_all" on crm_stages;
create policy "crm_stages_read_all" on crm_stages
  for select using (has_profile_in_org(org_id));

drop policy if exists "crm_stages_admin_write" on crm_stages;
create policy "crm_stages_admin_write" on crm_stages
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------- crm_contacts ----------
drop policy if exists "crm_contacts_select_pic_or_manager" on crm_contacts;
create policy "crm_contacts_select_pic_or_manager" on crm_contacts
  for select using (owns_profile(pic_id) or is_org_manager_or_admin(org_id));

drop policy if exists "crm_contacts_insert_own_or_manager" on crm_contacts;
create policy "crm_contacts_insert_own_or_manager" on crm_contacts
  for insert with check (owns_profile(pic_id) or is_org_manager_or_admin(org_id));

drop policy if exists "crm_contacts_update_pic_or_manager" on crm_contacts;
create policy "crm_contacts_update_pic_or_manager" on crm_contacts
  for update using (owns_profile(pic_id) or is_org_manager_or_admin(org_id))
  with check (owns_profile(pic_id) or is_org_manager_or_admin(org_id));

drop policy if exists "crm_contacts_delete_admin" on crm_contacts;
create policy "crm_contacts_delete_admin" on crm_contacts
  for delete using (is_org_admin(org_id));

-- crm_followups: unchanged — visibility already flows through the
-- (now correctly re-scoped) crm_contacts row via the EXISTS check.

-- ---------- organizations ----------
drop policy if exists "organizations_select_own_or_superadmin" on organizations;
create policy "organizations_select_own_or_superadmin" on organizations
  for select using (has_profile_in_org(id) or is_superadmin());

-- (organizations_superadmin_write is unchanged from migration 8)

-- =========================================================
-- To add yourself a second membership at another branch, run:
-- insert into profiles (id, user_id, full_name, email, org_id, role)
-- select uuid_generate_v4(), user_id, full_name, email,
--        '<the-other-org-id>', 'admin'
-- from profiles where email = 'your-email@example.com' limit 1;
-- =========================================================
