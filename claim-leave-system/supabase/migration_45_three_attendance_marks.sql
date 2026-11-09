-- =========================================================
-- ALL10S ERP / WiiTeam — Up to three attendance marks a day (migration 45)
--
-- Migration 44 first allowed two attendance marks a day. This raises the limit to three
-- (session 1, 2 and 3). Safe to run more than once, and safe to run even if you ran the
-- updated migration 44 (which already allows three). Run migration 44 first.
-- =========================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'attendance_marks_per_day'
  ) then
    raise exception 'Run migration 44 (lesson credits) first, then run this one.';
  end if;

  if exists (select 1 from pg_constraint where conname = 'classes_attendance_marks_per_day_check') then
    alter table classes drop constraint classes_attendance_marks_per_day_check;
  end if;
  alter table classes
    add constraint classes_attendance_marks_per_day_check check (attendance_marks_per_day in (1, 2, 3));

  if exists (select 1 from pg_constraint where conname = 'student_attendance_session_no_check') then
    alter table student_attendance drop constraint student_attendance_session_no_check;
  end if;
  alter table student_attendance
    add constraint student_attendance_session_no_check check (session_no in (1, 2, 3));
end $$;
