-- =========================================================
-- ALL10S ERP / WiiTeam — Multiple teachers per class (migration 20)
--
-- Classes previously had one teacher_id column. Moves to a proper
-- many-to-many join table (class_teachers), mirroring how
-- class_enrollments already works for students — so a class can
-- have 0, 1, or several teachers, each bulk-manageable the same way.
-- =========================================================

create table if not exists class_teachers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (class_id, teacher_id)
);

create index if not exists class_teachers_class_idx on class_teachers (class_id);
create index if not exists class_teachers_teacher_idx on class_teachers (teacher_id);

-- Carry over any existing single-teacher assignments before dropping the column.
insert into class_teachers (org_id, class_id, teacher_id)
select org_id, id, teacher_id from classes where teacher_id is not null
on conflict do nothing;

alter table classes drop column if exists teacher_id;

alter table class_teachers enable row level security;

drop policy if exists "class_teachers_read_all" on class_teachers;
create policy "class_teachers_read_all" on class_teachers
  for select using (has_profile_in_org(org_id));

drop policy if exists "class_teachers_admin_write" on class_teachers;
create policy "class_teachers_admin_write" on class_teachers
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
