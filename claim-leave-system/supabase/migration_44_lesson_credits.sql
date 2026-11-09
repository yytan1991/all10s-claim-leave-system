-- =========================================================
-- ALL10S ERP / WiiTeam — Lesson credits + two attendance marks a day (migration 44)
--
--  * A lesson can be set to "uses credits" (e.g. Foundation class = 12 credits).
--    Every time a student is marked Present or Late, 1 credit is deducted automatically.
--    Absent does not deduct. Changing or removing a mark returns the credit.
--  * A lesson can allow two attendance marks per day (session 1 and session 2).
--  * Every change to a student's credits is kept in student_credit_ledger, with the
--    date and time, so staff can see the history and parents can see when credits were used.
--  * Admins add or deduct credits by hand (rows of kind manual_add / manual_deduct).
-- =========================================================

-- ---------- 1. Lesson settings ----------
alter table classes add column if not exists attendance_marks_per_day smallint not null default 1;
alter table classes add column if not exists uses_credits boolean not null default false;
alter table classes add column if not exists credits_per_package integer not null default 12;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'classes_attendance_marks_per_day_check') then
    alter table classes add constraint classes_attendance_marks_per_day_check check (attendance_marks_per_day in (1, 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'classes_credits_per_package_check') then
    alter table classes add constraint classes_credits_per_package_check check (credits_per_package > 0);
  end if;
end $$;

-- ---------- 2. Attendance: a session number, so a student can be marked twice in one day ----------
alter table student_attendance add column if not exists session_no smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'student_attendance_session_no_check') then
    alter table student_attendance add constraint student_attendance_session_no_check check (session_no in (1, 2));
  end if;
end $$;

-- The old rule was one row per (lesson, student, date). Replace it with one row per session.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'student_attendance'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['attendance_date', 'class_id', 'student_id']
  loop
    execute format('alter table student_attendance drop constraint %I', c.conname);
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'student_attendance_unique_session') then
    alter table student_attendance
      add constraint student_attendance_unique_session unique (class_id, student_id, attendance_date, session_no);
  end if;
end $$;

-- ---------- 3. The credit history ----------
create table if not exists student_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  delta integer not null check (delta <> 0),
  kind text not null check (kind in ('attendance', 'attendance_undo', 'manual_add', 'manual_deduct')),
  occurred_at timestamptz not null default now(),
  attendance_id uuid references student_attendance(id) on delete set null,
  attendance_date date,
  session_no smallint,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (
    (kind in ('attendance', 'manual_deduct') and delta < 0)
    or (kind in ('attendance_undo', 'manual_add') and delta > 0)
  )
);

create index if not exists student_credit_ledger_class_student_idx on student_credit_ledger (class_id, student_id);
create index if not exists student_credit_ledger_student_idx on student_credit_ledger (student_id);
create index if not exists student_credit_ledger_org_idx on student_credit_ledger (org_id);

-- Is the signed-in staff member one of this lesson's assigned teachers?
create or replace function is_teacher_of_class(p_class_id uuid)
returns boolean as $$
  select exists (
    select 1
    from class_teachers ct
    join profiles p on p.id = ct.teacher_id
    where ct.class_id = p_class_id and p.user_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

alter table student_credit_ledger enable row level security;

-- Admins/managers see every student's credits; teachers see the lessons they teach.
drop policy if exists "credit_ledger_staff_read" on student_credit_ledger;
create policy "credit_ledger_staff_read" on student_credit_ledger
  for select using (is_org_manager_or_admin(org_id) or is_teacher_of_class(class_id));

-- Only admins add or deduct by hand. Attendance rows are written by the trigger below, never by a user.
drop policy if exists "credit_ledger_admin_adjust" on student_credit_ledger;
create policy "credit_ledger_admin_adjust" on student_credit_ledger
  for insert with check (
    is_org_admin(org_id)
    and kind in ('manual_add', 'manual_deduct')
    and exists (select 1 from classes c where c.id = class_id and c.org_id = student_credit_ledger.org_id)
    and exists (select 1 from students s where s.id = student_id and s.org_id = student_credit_ledger.org_id)
  );
-- (No update or delete policies: the history can't be edited. Mistakes are fixed by adding or deducting.)

-- ---------- 4. Deduct automatically when attendance is marked ----------
create or replace function sync_attendance_credit()
returns trigger as $$
declare
  v_uses boolean;
  v_counts_old boolean := false;
  v_counts_new boolean := false;
begin
  if tg_op = 'DELETE' then
    -- If the lesson or student is itself being deleted, there is nothing left to record against.
    if not exists (select 1 from classes where id = old.class_id)
       or not exists (select 1 from students where id = old.student_id) then
      return old;
    end if;
    select uses_credits into v_uses from classes where id = old.class_id;
    if v_uses and old.status in ('present', 'late') then
      insert into student_credit_ledger (org_id, class_id, student_id, delta, kind, occurred_at, attendance_date, session_no, note)
      values (old.org_id, old.class_id, old.student_id, 1, 'attendance_undo', now(), old.attendance_date, old.session_no, 'Attendance mark removed');
    end if;
    return old;
  end if;

  select uses_credits into v_uses from classes where id = new.class_id;
  if not coalesce(v_uses, false) then
    return new;
  end if;

  v_counts_new := new.status in ('present', 'late');
  if tg_op = 'UPDATE' then
    v_counts_old := old.status in ('present', 'late');
  end if;

  if v_counts_new and not v_counts_old then
    insert into student_credit_ledger (org_id, class_id, student_id, delta, kind, occurred_at, attendance_id, attendance_date, session_no, created_by)
    values (new.org_id, new.class_id, new.student_id, -1, 'attendance', coalesce(new.marked_at, now()), new.id, new.attendance_date, new.session_no, new.marked_by);
  elsif v_counts_old and not v_counts_new then
    insert into student_credit_ledger (org_id, class_id, student_id, delta, kind, occurred_at, attendance_id, attendance_date, session_no, note, created_by)
    values (new.org_id, new.class_id, new.student_id, 1, 'attendance_undo', now(), new.id, new.attendance_date, new.session_no, 'Attendance changed to absent', new.marked_by);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_student_attendance_credit on student_attendance;
create trigger on_student_attendance_credit
  after insert or update or delete on student_attendance
  for each row execute procedure sync_attendance_credit();

-- ---------- 5. What a parent sees: their own child's history, without staff notes ----------
create or replace function portal_credit_history(p_student_id uuid)
returns table (
  id uuid,
  class_id uuid,
  class_name text,
  delta integer,
  kind text,
  occurred_at timestamptz,
  attendance_date date,
  session_no smallint,
  balance_after bigint
) as $$
  select
    l.id,
    l.class_id,
    c.name,
    l.delta,
    l.kind,
    l.occurred_at,
    l.attendance_date,
    l.session_no,
    sum(l.delta) over (
      partition by l.class_id
      order by l.occurred_at, l.created_at, l.id
      rows between unbounded preceding and current row
    )
  from student_credit_ledger l
  join classes c on c.id = l.class_id
  where l.student_id = p_student_id
    and is_linked_parent_of(p_student_id)
  order by l.occurred_at desc, l.created_at desc, l.id desc;
$$ language sql stable security definer set search_path = public;
