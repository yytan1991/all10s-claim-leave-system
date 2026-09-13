-- =========================================================
-- ALL10S ERP — Payslips (migration 12)
--
-- Manual-entry payslip system: admin enters the final figures
-- (basic salary, allowances, EPF/SOCSO/EIS/PCB, deductions) per
-- staff per month, and the app renders/downloads a standard-format
-- PDF payslip. No automatic statutory calculation — admin has
-- full control over every number.
-- =========================================================

-- ---------- Company details shown on the payslip header ----------
alter table organizations add column if not exists address text;
alter table organizations add column if not exists registration_no text;
alter table organizations add column if not exists phone text;
alter table organizations add column if not exists email text;

-- ---------- Optional extra employee details used on payslips ----------
alter table profiles add column if not exists position text;
alter table profiles add column if not exists ic_number text;
alter table profiles add column if not exists bank_name text;
alter table profiles add column if not exists bank_account_no text;

-- ---------- Payslips ----------
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  profile_id uuid not null references profiles(id),
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  basic_salary numeric not null default 0,
  earnings jsonb not null default '[]',           -- [{ "label": "Overtime", "amount": 150 }]
  epf_employee numeric not null default 0,
  epf_employer numeric not null default 0,
  socso_employee numeric not null default 0,
  socso_employer numeric not null default 0,
  eis_employee numeric not null default 0,
  eis_employer numeric not null default 0,
  pcb numeric not null default 0,
  other_deductions jsonb not null default '[]',   -- [{ "label": "Advance", "amount": 200 }]
  payment_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (profile_id, period_month, period_year)
);

create or replace function touch_payslip()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists on_payslip_update on payslips;
create trigger on_payslip_update
  before update on payslips
  for each row execute procedure touch_payslip();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table payslips enable row level security;

drop policy if exists "payslips_select_own_or_manager" on payslips;
create policy "payslips_select_own_or_manager" on payslips
  for select using (owns_profile(profile_id) or is_org_manager_or_admin(org_id));

drop policy if exists "payslips_admin_write" on payslips;
create policy "payslips_admin_write" on payslips
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- Let org admins maintain their own organization's company details
-- (name, address, registration no, etc). Superadmin retains full
-- control (including activate/suspend) via the existing policy.
drop policy if exists "organizations_admin_update_own" on organizations;
create policy "organizations_admin_update_own" on organizations
  for update using (is_org_admin(id)) with check (is_org_admin(id));
