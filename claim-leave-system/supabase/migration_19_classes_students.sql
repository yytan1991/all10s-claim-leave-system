-- =========================================================
-- ALL10S ERP / WiiTeam — Student Management Phase 1a (migration 19)
--
-- Subjects, classes (recurring weekly slots), a minimal student
-- record (full parent-facing profile comes in a later phase), and
-- class enrollment — enough to support bulk enroll/unenroll
-- students per class, and bulk assign/remove classes per teacher.
-- =========================================================

-- ---------- Subjects (free-form, admin-defined per org) ----------
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  created_at timestamptz default now(),
  unique (org_id, name)
);

-- ---------- Classes: a fixed recurring weekly slot ----------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  subject_id uuid not null references subjects(id),
  teacher_id uuid references profiles(id),
  day_of_week int not null check (day_of_week between 0 and 6), -- 0 = Monday .. 6 = Sunday
  start_time time not null,
  end_time time not null,
  room text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists classes_org_idx on classes (org_id);
create index if not exists classes_teacher_idx on classes (teacher_id);

-- ---------- Students (minimal record — full profile comes later) ----------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  full_name text not null,
  parent_name text,
  parent_contact text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists students_org_idx on students (org_id);

-- ---------- Class enrollment (which students are in which class) ----------
create table if not exists class_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  enrolled_at timestamptz default now(),
  created_by uuid references profiles(id),
  unique (class_id, student_id)
);

create index if not exists class_enrollments_class_idx on class_enrollments (class_id);
create index if not exists class_enrollments_student_idx on class_enrollments (student_id);

-- =========================================================
-- Row Level Security — visible to all staff in the org, managed
-- by admin (matches the sensitivity level of Employees/Settings)
-- =========================================================
alter table subjects enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table class_enrollments enable row level security;

drop policy if exists "subjects_read_all" on subjects;
create policy "subjects_read_all" on subjects
  for select using (has_profile_in_org(org_id));

drop policy if exists "subjects_admin_write" on subjects;
create policy "subjects_admin_write" on subjects
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "classes_read_all" on classes;
create policy "classes_read_all" on classes
  for select using (has_profile_in_org(org_id));

drop policy if exists "classes_admin_write" on classes;
create policy "classes_admin_write" on classes
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "students_read_all" on students;
create policy "students_read_all" on students
  for select using (has_profile_in_org(org_id));

drop policy if exists "students_admin_write" on students;
create policy "students_admin_write" on students
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "class_enrollments_read_all" on class_enrollments;
create policy "class_enrollments_read_all" on class_enrollments
  for select using (has_profile_in_org(org_id));

drop policy if exists "class_enrollments_admin_write" on class_enrollments;
create policy "class_enrollments_admin_write" on class_enrollments
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
