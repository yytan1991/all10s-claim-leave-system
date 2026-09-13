-- =========================================================
-- ALL10S ERP — Fix work location deletion (migration 5)
--
-- Previously, deleting a work location failed silently if any
-- attendance record still referenced it (foreign key violation).
-- This changes that reference to SET NULL on delete, so admin can
-- remove a location and historical attendance records simply keep
-- their clock-in/out times without a location name attached.
-- =========================================================

alter table attendance_records
  drop constraint if exists attendance_records_work_location_id_fkey;

alter table attendance_records
  add constraint attendance_records_work_location_id_fkey
  foreign key (work_location_id) references work_locations(id) on delete set null;
