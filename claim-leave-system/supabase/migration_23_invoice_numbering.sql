-- =========================================================
-- ALL10S ERP / WiiTeam — Invoice numbering + payment amount (migration 23)
-- =========================================================

alter table student_invoices add column if not exists invoice_no bigserial;
alter table student_invoices add column if not exists payment_amount numeric not null default 0;
