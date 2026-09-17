-- =========================================================
-- ALL10S ERP — Cash Flow (migration 14)
--
-- Manual income/expense tracking with a calendar view of expected
-- and actual payment dates. Recurring entries (monthly, quarterly,
-- half-yearly, yearly) are materialized as individual rows at
-- creation time — sharing a recurrence_group_id — so each
-- occurrence can be individually marked received/paid, edited, or
-- deleted without needing date-math at read time.
--
-- Restricted to org admins only (financial data), same sensitivity
-- level as payslips.
-- =========================================================

create table if not exists cashflow_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  type text not null check (type in ('income', 'expense')),
  description text not null,
  category text,
  amount numeric not null check (amount > 0),
  due_date date not null,
  status text not null default 'expected' check (status in ('expected', 'completed', 'cancelled')),
  recurrence_interval_months int,           -- null = one-off; else 1, 3, 6, or 12
  recurrence_group_id uuid,                 -- shared by all occurrences generated together
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists cashflow_entries_org_due_date_idx on cashflow_entries (org_id, due_date);

create or replace function touch_cashflow_entry()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists on_cashflow_entry_update on cashflow_entries;
create trigger on_cashflow_entry_update
  before update on cashflow_entries
  for each row execute procedure touch_cashflow_entry();

-- =========================================================
-- Row Level Security — admin only (financial data)
-- =========================================================
alter table cashflow_entries enable row level security;

drop policy if exists "cashflow_admin_only" on cashflow_entries;
create policy "cashflow_admin_only" on cashflow_entries
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
