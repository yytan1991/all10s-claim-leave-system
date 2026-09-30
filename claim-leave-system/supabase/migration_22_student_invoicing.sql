-- =========================================================
-- ALL10S ERP / WiiTeam — Student invoicing (migration 22)
--
-- A student's fee is either a fixed monthly amount, or the sum of
-- the fees on whichever classes they're enrolled in — admin's
-- choice per student. Invoices are materialized rows (same pattern
-- as Cash Flow and Payslips) so each one is individually markable
-- paid/unpaid without needing a scheduled job to run.
-- =========================================================

alter table classes add column if not exists fee_amount numeric;

alter table students add column if not exists billing_mode text not null default 'fixed'
  check (billing_mode in ('fixed', 'per_class'));
alter table students add column if not exists fixed_fee_amount numeric not null default 0;
alter table students add column if not exists default_recurrence_months int not null default 1;

create table if not exists student_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  student_id uuid not null references students(id) on delete cascade,
  description text,
  amount numeric not null check (amount >= 0),
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'cancelled')),
  payment_date date,
  recurrence_interval_months int,
  recurrence_group_id uuid,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists student_invoices_org_due_idx on student_invoices (org_id, due_date);
create index if not exists student_invoices_student_idx on student_invoices (student_id);

create or replace function touch_student_invoice()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists on_student_invoice_update on student_invoices;
create trigger on_student_invoice_update
  before update on student_invoices
  for each row execute procedure touch_student_invoice();

alter table student_invoices enable row level security;

drop policy if exists "student_invoices_admin_only" on student_invoices;
create policy "student_invoices_admin_only" on student_invoices
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
