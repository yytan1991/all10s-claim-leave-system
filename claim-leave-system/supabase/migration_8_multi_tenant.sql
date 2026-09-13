-- =========================================================
-- ALL10S ERP — Multi-tenant + Superadmin (migration 8)
--
-- Turns this from a single-company app into a multi-tenant
-- platform: every school/company ("organization") gets fully
-- isolated data, and a new "superadmin" role can activate or
-- suspend any organization's access to the whole system.
--
-- Run this AFTER migrations 1-7. It is safe to run once; some
-- statements are idempotent (IF NOT EXISTS) but the backfill/
-- NOT NULL steps should only run a single time on a database
-- that doesn't already have org_id populated.
-- =========================================================

-- ---------- Organizations (tenants) ----------
create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- ---------- Seed your existing business as the first organization ----------
do $$
declare
  v_org_id uuid;
begin
  select id into v_org_id from organizations where name = 'ALL10S EDU' limit 1;
  if v_org_id is null then
    insert into organizations (name, is_active) values ('ALL10S EDU', true) returning id into v_org_id;
  end if;

  -- ---------- Add org_id to every tenant-scoped table ----------
  alter table profiles add column if not exists org_id uuid references organizations(id);
  alter table leave_types add column if not exists org_id uuid references organizations(id);
  alter table leave_balances add column if not exists org_id uuid references organizations(id);
  alter table leave_applications add column if not exists org_id uuid references organizations(id);
  alter table claim_types add column if not exists org_id uuid references organizations(id);
  alter table claims add column if not exists org_id uuid references organizations(id);
  alter table work_locations add column if not exists org_id uuid references organizations(id);
  alter table attendance_records add column if not exists org_id uuid references organizations(id);
  alter table crm_stages add column if not exists org_id uuid references organizations(id);
  alter table crm_contacts add column if not exists org_id uuid references organizations(id);
  alter table crm_followups add column if not exists org_id uuid references organizations(id);

  -- ---------- Backfill every existing row to the ALL10S EDU org ----------
  update profiles set org_id = v_org_id where org_id is null;
  update leave_types set org_id = v_org_id where org_id is null;
  update leave_balances set org_id = v_org_id where org_id is null;
  update leave_applications set org_id = v_org_id where org_id is null;
  update claim_types set org_id = v_org_id where org_id is null;
  update claims set org_id = v_org_id where org_id is null;
  update work_locations set org_id = v_org_id where org_id is null;
  update attendance_records set org_id = v_org_id where org_id is null;
  update crm_stages set org_id = v_org_id where org_id is null;
  update crm_contacts set org_id = v_org_id where org_id is null;
  update crm_followups set org_id = v_org_id where org_id is null;
end $$;

-- ---------- Require org_id everywhere except profiles ----------
-- (profiles.org_id stays nullable — a superadmin belongs to no single
-- tenant. Every other table always requires one.)
alter table leave_types alter column org_id set not null;
alter table leave_balances alter column org_id set not null;
alter table leave_applications alter column org_id set not null;
alter table claim_types alter column org_id set not null;
alter table claims alter column org_id set not null;
alter table work_locations alter column org_id set not null;
alter table attendance_records alter column org_id set not null;
alter table crm_stages alter column org_id set not null;
alter table crm_contacts alter column org_id set not null;
alter table crm_followups alter column org_id set not null;

alter table profiles drop constraint if exists profiles_org_id_required;
alter table profiles add constraint profiles_org_id_required
  check (org_id is not null or role = 'superadmin');

-- ---------- Allow the same leave/claim/stage name in different orgs ----------
alter table leave_types drop constraint if exists leave_types_name_key;
alter table leave_types drop constraint if exists leave_types_org_name_unique;
alter table leave_types add constraint leave_types_org_name_unique unique (org_id, name);

alter table claim_types drop constraint if exists claim_types_name_key;
alter table claim_types drop constraint if exists claim_types_org_name_unique;
alter table claim_types add constraint claim_types_org_name_unique unique (org_id, name);

alter table crm_stages drop constraint if exists crm_stages_name_key;
alter table crm_stages drop constraint if exists crm_stages_org_name_unique;
alter table crm_stages add constraint crm_stages_org_name_unique unique (org_id, name);

-- ---------- Add the superadmin role ----------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('staff', 'manager', 'admin', 'superadmin'));

-- =========================================================
-- Helper functions
-- =========================================================
create or replace function current_org_id()
returns uuid as $$
  select org_id from profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function is_superadmin()
returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'superadmin');
$$ language sql security definer stable;

-- Auto-fills org_id from the acting user on every insert — the app's
-- existing insert calls never need to be changed; this fills it in
-- server-side and can't be spoofed by the client.
create or replace function set_org_id()
returns trigger as $$
begin
  new.org_id := current_org_id();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_set_org_id on leave_types; create trigger trg_set_org_id before insert on leave_types for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on leave_balances; create trigger trg_set_org_id before insert on leave_balances for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on leave_applications; create trigger trg_set_org_id before insert on leave_applications for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on claim_types; create trigger trg_set_org_id before insert on claim_types for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on claims; create trigger trg_set_org_id before insert on claims for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on work_locations; create trigger trg_set_org_id before insert on work_locations for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on attendance_records; create trigger trg_set_org_id before insert on attendance_records for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on crm_stages; create trigger trg_set_org_id before insert on crm_stages for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on crm_contacts; create trigger trg_set_org_id before insert on crm_contacts for each row execute procedure set_org_id();
drop trigger if exists trg_set_org_id on crm_followups; create trigger trg_set_org_id before insert on crm_followups for each row execute procedure set_org_id();

-- ---------- New signups: assign org from invite metadata, else fall back ----------
create or replace function handle_new_user()
returns trigger as $$
declare
  v_org_id uuid;
begin
  v_org_id := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  if v_org_id is null then
    select id into v_org_id from organizations where name = 'ALL10S EDU' limit 1;
  end if;
  insert into public.profiles (id, full_name, email, org_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, v_org_id);
  return new;
end;
$$ language plpgsql security definer;

-- =========================================================
-- Row Level Security — organizations
-- =========================================================
alter table organizations enable row level security;

drop policy if exists "organizations_select_own_or_superadmin" on organizations;
create policy "organizations_select_own_or_superadmin" on organizations
  for select using (id = current_org_id() or is_superadmin());

drop policy if exists "organizations_superadmin_write" on organizations;
create policy "organizations_superadmin_write" on organizations
  for all using (is_superadmin()) with check (is_superadmin());

-- =========================================================
-- Row Level Security — rewrite every existing policy with org scoping
-- =========================================================

-- ---------- profiles ----------
drop policy if exists "profiles_select_own_or_manager" on profiles;
create policy "profiles_select_own_or_manager" on profiles
  for select using (
    id = auth.uid()
    or is_superadmin()
    or (is_manager_or_admin() and org_id = current_org_id())
  );

drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles
  for update using (is_superadmin() or (is_admin() and org_id = current_org_id()));

-- ---------- leave_types ----------
drop policy if exists "leave_types_read_all" on leave_types;
create policy "leave_types_read_all" on leave_types
  for select using (org_id = current_org_id());

drop policy if exists "leave_types_admin_write" on leave_types;
create policy "leave_types_admin_write" on leave_types
  for all using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- ---------- claim_types ----------
drop policy if exists "claim_types_read_all" on claim_types;
create policy "claim_types_read_all" on claim_types
  for select using (org_id = current_org_id());

drop policy if exists "claim_types_admin_write" on claim_types;
create policy "claim_types_admin_write" on claim_types
  for all using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- ---------- leave_balances ----------
drop policy if exists "leave_balances_select_own_or_manager" on leave_balances;
create policy "leave_balances_select_own_or_manager" on leave_balances
  for select using (
    profile_id = auth.uid()
    or (is_manager_or_admin() and org_id = current_org_id())
  );

drop policy if exists "leave_balances_admin_write" on leave_balances;
create policy "leave_balances_admin_write" on leave_balances
  for all using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- ---------- leave_applications ----------
drop policy if exists "leave_apps_select_own_or_manager" on leave_applications;
create policy "leave_apps_select_own_or_manager" on leave_applications
  for select using (
    profile_id = auth.uid()
    or (is_manager_or_admin() and org_id = current_org_id())
  );

drop policy if exists "leave_apps_insert_own" on leave_applications;
create policy "leave_apps_insert_own" on leave_applications
  for insert with check (profile_id = auth.uid());

drop policy if exists "leave_apps_update_own_pending_cancel" on leave_applications;
create policy "leave_apps_update_own_pending_cancel" on leave_applications
  for update using (profile_id = auth.uid() and status = 'pending')
  with check (profile_id = auth.uid());

drop policy if exists "leave_apps_update_manager_decision" on leave_applications;
create policy "leave_apps_update_manager_decision" on leave_applications
  for update using (is_manager_or_admin() and org_id = current_org_id())
  with check (is_manager_or_admin() and org_id = current_org_id());

-- ---------- claims ----------
drop policy if exists "claims_select_own_or_manager" on claims;
create policy "claims_select_own_or_manager" on claims
  for select using (
    profile_id = auth.uid()
    or (is_manager_or_admin() and org_id = current_org_id())
  );

drop policy if exists "claims_insert_own" on claims;
create policy "claims_insert_own" on claims
  for insert with check (profile_id = auth.uid());

drop policy if exists "claims_update_manager_decision" on claims;
create policy "claims_update_manager_decision" on claims
  for update using (is_manager_or_admin() and org_id = current_org_id())
  with check (is_manager_or_admin() and org_id = current_org_id());

-- ---------- work_locations ----------
drop policy if exists "work_locations_read_all" on work_locations;
create policy "work_locations_read_all" on work_locations
  for select using (org_id = current_org_id());

drop policy if exists "work_locations_admin_write" on work_locations;
create policy "work_locations_admin_write" on work_locations
  for all using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- ---------- attendance_records ----------
drop policy if exists "attendance_select_own_or_manager" on attendance_records;
create policy "attendance_select_own_or_manager" on attendance_records
  for select using (
    profile_id = auth.uid()
    or (is_manager_or_admin() and org_id = current_org_id())
  );

drop policy if exists "attendance_insert_own" on attendance_records;
create policy "attendance_insert_own" on attendance_records
  for insert with check (profile_id = auth.uid());

drop policy if exists "attendance_update_own" on attendance_records;
create policy "attendance_update_own" on attendance_records
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "attendance_admin_write" on attendance_records;
create policy "attendance_admin_write" on attendance_records
  for update using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

drop policy if exists "attendance_admin_insert" on attendance_records;
create policy "attendance_admin_insert" on attendance_records
  for insert with check (is_admin() and org_id = current_org_id());

-- ---------- crm_stages ----------
drop policy if exists "crm_stages_read_all" on crm_stages;
create policy "crm_stages_read_all" on crm_stages
  for select using (org_id = current_org_id());

drop policy if exists "crm_stages_admin_write" on crm_stages;
create policy "crm_stages_admin_write" on crm_stages
  for all using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- ---------- crm_contacts ----------
drop policy if exists "crm_contacts_select_pic_or_manager" on crm_contacts;
create policy "crm_contacts_select_pic_or_manager" on crm_contacts
  for select using (
    pic_id = auth.uid()
    or (is_manager_or_admin() and org_id = current_org_id())
  );

drop policy if exists "crm_contacts_insert_own_or_manager" on crm_contacts;
create policy "crm_contacts_insert_own_or_manager" on crm_contacts
  for insert with check (pic_id = auth.uid() or is_manager_or_admin());

drop policy if exists "crm_contacts_update_pic_or_manager" on crm_contacts;
create policy "crm_contacts_update_pic_or_manager" on crm_contacts
  for update using (
    pic_id = auth.uid()
    or (is_manager_or_admin() and org_id = current_org_id())
  )
  with check (
    pic_id = auth.uid()
    or (is_manager_or_admin() and org_id = current_org_id())
  );

drop policy if exists "crm_contacts_delete_admin" on crm_contacts;
create policy "crm_contacts_delete_admin" on crm_contacts
  for delete using (is_admin() and org_id = current_org_id());

-- crm_followups policies are unchanged — visibility already flows
-- through the org-scoped crm_contacts row via the EXISTS check.

-- =========================================================
-- Promote your own account to superadmin (run manually):
-- update profiles set role = 'superadmin', org_id = null
--   where email = 'your-email@example.com';
-- =========================================================
