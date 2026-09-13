-- =========================================================
-- ALL10S ERP — Clear test activity data
--
-- Removes leave requests, claims, attendance records, and CRM
-- leads (across ALL organizations). Keeps organizations, staff
-- accounts, and configured settings (leave/claim types, work
-- locations, pipeline stages) untouched.
--
-- Leave balances are RESET to 0 used days rather than deleted,
-- so each employee's configured entitlement (entitled_days)
-- stays intact.
-- =========================================================

-- CRM leads (follow-up history is removed automatically via cascade)
delete from crm_contacts;

-- Leave applications
delete from leave_applications;

-- Claims
delete from claims;

-- Attendance clock-in/out records
delete from attendance_records;

-- Reset used leave days back to 0 (keeps each person's configured
-- entitled_days as-is)
update leave_balances set used_days = 0;

-- =========================================================
-- Verify everything cleared as expected
-- =========================================================
select
  (select count(*) from crm_contacts) as crm_contacts_remaining,
  (select count(*) from leave_applications) as leave_applications_remaining,
  (select count(*) from claims) as claims_remaining,
  (select count(*) from attendance_records) as attendance_remaining,
  (select count(*) from leave_balances where used_days > 0) as balances_still_nonzero;
