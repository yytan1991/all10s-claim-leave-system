-- =========================================================
-- ALL10S ERP / WiiTeam — Learning materials (migration 40)
--
-- Teachers (for their own classes) and admins (for any class) upload videos,
-- worksheets/files and notes per class. A student sees the materials of the
-- classes they are enrolled in, in the "Learning" tab of the student portal.
-- =========================================================

create table if not exists learning_materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  material_type text not null check (material_type in ('video', 'file', 'note')),
  url text,
  file_name text,
  storage_path text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists learning_materials_class_idx on learning_materials (class_id, created_at desc);

-- Can the signed-in staff member manage this class's materials?
-- Admins: any class in their centre. Teachers: only classes they teach.
create or replace function can_manage_class_materials(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from classes c
    where c.id = p_class_id
      and (
        is_org_admin(c.org_id)
        or exists (
          select 1
          from class_teachers ct
          join profiles p on p.id = ct.teacher_id
          where ct.class_id = c.id and p.user_id = auth.uid()
        )
      )
  );
$$;

-- Is the signed-in user a student enrolled in this class?
create or replace function is_enrolled_student_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from class_enrollments ce
    join student_accounts sa on sa.student_id = ce.student_id
    where ce.class_id = p_class_id and sa.user_id = auth.uid()
  );
$$;

grant execute on function can_manage_class_materials(uuid) to authenticated;
grant execute on function is_enrolled_student_in_class(uuid) to authenticated;

alter table learning_materials enable row level security;

drop policy if exists "learning_materials_staff_read" on learning_materials;
create policy "learning_materials_staff_read" on learning_materials
  for select using (can_manage_class_materials(class_id));

drop policy if exists "learning_materials_staff_insert" on learning_materials;
create policy "learning_materials_staff_insert" on learning_materials
  for insert with check (
    can_manage_class_materials(class_id)
    and org_id = (select c.org_id from classes c where c.id = class_id)
  );

drop policy if exists "learning_materials_staff_update" on learning_materials;
create policy "learning_materials_staff_update" on learning_materials
  for update using (can_manage_class_materials(class_id));

drop policy if exists "learning_materials_staff_delete" on learning_materials;
create policy "learning_materials_staff_delete" on learning_materials
  for delete using (can_manage_class_materials(class_id));

drop policy if exists "learning_materials_student_read" on learning_materials;
create policy "learning_materials_student_read" on learning_materials
  for select using (is_enrolled_student_in_class(class_id));

-- ---------- file storage ----------
-- Public bucket (files open by link, like your announcement pictures); only
-- staff can add or remove files.

insert into storage.buckets (id, name, public)
values ('learning-materials', 'learning-materials', true)
on conflict (id) do nothing;

drop policy if exists "learning_materials_staff_upload" on storage.objects;
create policy "learning_materials_staff_upload" on storage.objects
  for insert with check (
    bucket_id = 'learning-materials'
    and exists (select 1 from public.profiles p where p.user_id = auth.uid())
  );

drop policy if exists "learning_materials_staff_remove" on storage.objects;
create policy "learning_materials_staff_remove" on storage.objects
  for delete using (
    bucket_id = 'learning-materials'
    and exists (select 1 from public.profiles p where p.user_id = auth.uid())
  );
