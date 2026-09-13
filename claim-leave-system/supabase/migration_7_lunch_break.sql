-- =========================================================
-- ALL10S ERP — Lunch break clocking (migration 7)
--
-- Adds a lunch start/end pair to each attendance record, tracked
-- the same way as clock in/out (with geolocation), so total hours
-- worked can be calculated net of the lunch break.
-- =========================================================

alter table attendance_records
  add column if not exists lunch_start_at timestamptz,
  add column if not exists lunch_start_lat double precision,
  add column if not exists lunch_start_lng double precision,
  add column if not exists lunch_end_at timestamptz,
  add column if not exists lunch_end_lat double precision,
  add column if not exists lunch_end_lng double precision;
