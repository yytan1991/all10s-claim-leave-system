-- =========================================================
-- ALL 10S EDU — Claim & Leave Management System
-- Supabase schema: tables, RLS policies, storage buckets
-- Run this in the Supabase SQL editor for a fresh project.
-- =========================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- Profiles ----------
-- One row per staff member, linked 1:1 to auth.users.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  department text,
  role text not null default 'staff' check (role in ('staff', 'manager', 'admin')),
  manager_id uuid references profiles(id),
  join_date date default current_date,
  created_at timestamptz default now()
);

-- ---------- Leave types ----------
create table if not exists leave_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  requires_attachment boolean not null default false,
  created_at timestamptz default now()
);

-- ---------- Leave balances (per staff, per type, per year) ----------
create table if not exists leave_balances (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id) on delete cascade,
  year int not null,
  entitled_days numeric not null default 0,
  used_days numeric not null default 0,
  unique (profile_id, leave_type_id, year)
);

-- ---------- Leave applications ----------
create table if not exists leave_applications (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id),
  start_date date not null,
  end_date date not null,
  days numeric not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  attachment_url text,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- Claim types ----------
create table if not exists claim_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz default now()
);

-- ---------- Claims ----------
create table if not exists claims (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  claim_type_id uuid not null references claim_types(id),
  claim_date date not null,
  amount numeric not null check (amount > 0),
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  attachment_url text,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- Auto-create a profile row when a new auth user signs up ----------
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Keep used_days in sync when a leave application is approved/reverted.
create or replace function sync_leave_balance()
returns trigger as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update leave_balances
      set used_days = used_days + new.days
      where profile_id = new.profile_id
        and leave_type_id = new.leave_type_id
        and year = extract(year from new.start_date)::int;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    update leave_balances
      set used_days = greatest(0, used_days - new.days)
      where profile_id = new.profile_id
        and leave_type_id = new.leave_type_id
        and year = extract(year from new.start_date)::int;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_leave_status_change on leave_applications;
create trigger on_leave_status_change
  after update of status on leave_applications
  for each row execute procedure sync_leave_balance();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table profiles enable row level security;
alter table leave_types enable row level security;
alter table leave_balances enable row level security;
alter table leave_applications enable row level security;
alter table claim_types enable row level security;
alter table claims enable row level security;

-- Helper: is the current user a manager or admin?
create or replace function is_manager_or_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('manager', 'admin')
  );
$$ language sql security definer stable;

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---------- profiles ----------
create policy "profiles_select_own_or_manager" on profiles
  for select using (id = auth.uid() or is_manager_or_admin());

create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

create policy "profiles_update_admin" on profiles
  for update using (is_admin());

-- ---------- leave_types / claim_types: everyone can read, only admin writes ----------
create policy "leave_types_read_all" on leave_types for select using (true);
create policy "leave_types_admin_write" on leave_types for all using (is_admin()) with check (is_admin());

create policy "claim_types_read_all" on claim_types for select using (true);
create policy "claim_types_admin_write" on claim_types for all using (is_admin()) with check (is_admin());

-- ---------- leave_balances ----------
create policy "leave_balances_select_own_or_manager" on leave_balances
  for select using (profile_id = auth.uid() or is_manager_or_admin());

create policy "leave_balances_admin_write" on leave_balances
  for all using (is_admin()) with check (is_admin());

-- ---------- leave_applications ----------
create policy "leave_apps_select_own_or_manager" on leave_applications
  for select using (profile_id = auth.uid() or is_manager_or_admin());

create policy "leave_apps_insert_own" on leave_applications
  for insert with check (profile_id = auth.uid());

create policy "leave_apps_update_own_pending_cancel" on leave_applications
  for update using (profile_id = auth.uid() and status = 'pending')
  with check (profile_id = auth.uid());

create policy "leave_apps_update_manager_decision" on leave_applications
  for update using (is_manager_or_admin())
  with check (is_manager_or_admin());

-- ---------- claims ----------
create policy "claims_select_own_or_manager" on claims
  for select using (profile_id = auth.uid() or is_manager_or_admin());

create policy "claims_insert_own" on claims
  for insert with check (profile_id = auth.uid());

create policy "claims_update_manager_decision" on claims
  for update using (is_manager_or_admin())
  with check (is_manager_or_admin());

-- =========================================================
-- Storage buckets for attachments
-- =========================================================
insert into storage.buckets (id, name, public)
values ('leave-attachments', 'leave-attachments', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('claim-attachments', 'claim-attachments', true)
on conflict (id) do nothing;

create policy "leave_attachments_upload_own" on storage.objects
  for insert with check (
    bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "leave_attachments_read_all_authenticated" on storage.objects
  for select using (bucket_id = 'leave-attachments' and auth.role() = 'authenticated');

create policy "claim_attachments_upload_own" on storage.objects
  for insert with check (
    bucket_id = 'claim-attachments' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "claim_attachments_read_all_authenticated" on storage.objects
  for select using (bucket_id = 'claim-attachments' and auth.role() = 'authenticated');

-- =========================================================
-- Seed data — starter leave & claim types
-- =========================================================
insert into leave_types (name, requires_attachment) values
  ('Annual Leave', false),
  ('Sick Leave', true),
  ('Emergency Leave', false),
  ('Unpaid Leave', false),
  ('Maternity Leave', true),
  ('Paternity Leave', true)
on conflict (name) do nothing;

insert into claim_types (name) values
  ('Travel & Mileage'),
  ('Meals & Entertainment'),
  ('Office Supplies'),
  ('Medical'),
  ('Training & Development'),
  ('Others')
on conflict (name) do nothing;

-- =========================================================
-- To promote your first admin, run this after you sign up:
-- update profiles set role = 'admin' where email = 'your-email@example.com';
-- =========================================================
