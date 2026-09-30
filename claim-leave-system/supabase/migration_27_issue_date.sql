-- =========================================================
-- ALL10S ERP / WiiTeam — Distinct issue date (migration 27)
--
-- Until now, due_date was doing double duty as "the invoice date".
-- Backfills issue_date from the existing due_date values, then
-- due_date becomes a genuine, separately-editable payment due date
-- going forward.
-- =========================================================

alter table student_invoices add column if not exists issue_date date;
update student_invoices set issue_date = due_date where issue_date is null;
alter table student_invoices alter column issue_date set not null;
