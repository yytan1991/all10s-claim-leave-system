-- =========================================================
-- ALL10S ERP / WiiTeam — Recurring invoice plans (migration 25)
--
-- Replaces the old "per-student billing preference" model with
-- proper recurring invoice plans: each row is an ongoing billing
-- arrangement (student, description, amount, frequency) with a
-- tracked next-generation date. "Generate Invoice" creates one
-- actual invoice from the plan and advances the date forward.
-- =========================================================

create table if not exists recurring_invoice_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  student_id uuid not null references students(id) on delete cascade,
  description text,
  amount numeric not null check (amount >= 0),
  recurrence_interval_months int not null default 1,
  next_generation_date date not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists recurring_invoice_plans_org_idx on recurring_invoice_plans (org_id);
create index if not exists recurring_invoice_plans_student_idx on recurring_invoice_plans (student_id);

create or replace function touch_recurring_invoice_plan()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists on_recurring_invoice_plan_update on recurring_invoice_plans;
create trigger on_recurring_invoice_plan_update
  before update on recurring_invoice_plans
  for each row execute procedure touch_recurring_invoice_plan();

alter table recurring_invoice_plans enable row level security;

drop policy if exists "recurring_invoice_plans_admin_only" on recurring_invoice_plans;
create policy "recurring_invoice_plans_admin_only" on recurring_invoice_plans
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
