-- =========================================================
-- ALL10S ERP / WiiTeam — Billing items + invoice month (migration 26)
-- =========================================================

alter table student_invoices add column if not exists invoice_month text;
alter table student_invoices add column if not exists items jsonb not null default '[]';

alter table recurring_invoice_plans add column if not exists items jsonb not null default '[]';
alter table recurring_invoice_plans add column if not exists next_invoice_month text;
