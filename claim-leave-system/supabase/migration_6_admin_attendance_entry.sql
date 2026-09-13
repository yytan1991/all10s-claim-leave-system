-- =========================================================
-- ALL10S ERP — Admin manual attendance entry (migration 6)
--
-- The existing "attendance_insert_own" policy only lets someone
-- insert their own attendance record. This adds a matching policy
-- so admin can manually key in a clock-in/out for any staff member
-- (e.g. when someone forgot to clock in, or was off-site for work).
-- =========================================================

create policy "attendance_admin_insert" on attendance_records
  for insert with check (is_admin());
