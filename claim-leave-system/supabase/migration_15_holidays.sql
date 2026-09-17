-- =========================================================
-- ALL10S ERP — Holiday calendar (migration 15)
--
-- Simple, standalone holiday list per organization. Doesn't depend
-- on students/classes — first building block toward the school-
-- management redo, but useful entirely on its own right now.
-- =========================================================

create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  date date not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (org_id, date)
);

create index if not exists holidays_org_date_idx on holidays (org_id, date);

alter table holidays enable row level security;

drop policy if exists "holidays_read_all" on holidays;
create policy "holidays_read_all" on holidays
  for select using (has_profile_in_org(org_id));

drop policy if exists "holidays_admin_write" on holidays;
create policy "holidays_admin_write" on holidays
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
