-- =========================================================
-- ALL 10S EDU — Attendance module (migration 2)
-- Run this AFTER schema.sql, in the Supabase SQL editor.
-- Adds: per-staff working hours, work locations (geofences),
-- and daily attendance records with geolocation clock in/out.
-- =========================================================

-- ---------- Per-staff working hours ----------
alter table profiles
  add column if not exists work_start_time time not null default '09:00',
  add column if not exists work_end_time time not null default '18:00';

-- ---------- Work locations (geofences staff must clock in from) ----------
create table if not exists work_locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters int not null default 50,
  created_at timestamptz default now()
);

-- ---------- Attendance records (one row per staff per day) ----------
create table if not exists attendance_records (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  work_location_id uuid references work_locations(id),
  date date not null default current_date,
  clock_in_at timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_out_at timestamptz,
  clock_out_lat double precision,
  clock_out_lng double precision,
  is_late boolean not null default false,
  created_at timestamptz default now(),
  unique (profile_id, date)
);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table work_locations enable row level security;
alter table attendance_records enable row level security;

-- work_locations: everyone signed in can read (needed to check in),
-- only admin can add/edit/remove.
create policy "work_locations_read_all" on work_locations
  for select using (auth.role() = 'authenticated');

create policy "work_locations_admin_write" on work_locations
  for all using (is_admin()) with check (is_admin());

-- attendance_records: staff see + create/update their own; managers/admins see all.
create policy "attendance_select_own_or_manager" on attendance_records
  for select using (profile_id = auth.uid() or is_manager_or_admin());

create policy "attendance_insert_own" on attendance_records
  for insert with check (profile_id = auth.uid());

create policy "attendance_update_own" on attendance_records
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Admins can correct/adjust any attendance record (e.g. manual fix).
create policy "attendance_admin_write" on attendance_records
  for update using (is_admin())
  with check (is_admin());

-- =========================================================
-- Example: add your first work location (edit values, then run)
-- =========================================================
-- insert into work_locations (name, latitude, longitude, radius_meters)
-- values ('ALL 10S EDU Cheras Centre', 3.0738, 101.7370, 50);
