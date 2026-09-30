-- =========================================================
-- ALL10S ERP / WiiTeam — Invoice settings + richer invoices (migration 24)
-- =========================================================

create table if not exists invoice_discount_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  type text not null default 'fixed' check (type in ('fixed', 'percent')),
  value numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists invoice_tax_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  type text not null default 'fixed' check (type in ('fixed', 'percent')),
  value numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists invoice_remark_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  text text not null,
  created_at timestamptz default now()
);

create table if not exists invoice_payment_methods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  created_at timestamptz default now()
);

alter table student_invoices add column if not exists subtotal numeric;
update student_invoices set subtotal = amount where subtotal is null;
alter table student_invoices alter column subtotal set not null;

alter table student_invoices add column if not exists discount_amount numeric not null default 0;
alter table student_invoices add column if not exists tax_amount numeric not null default 0;
alter table student_invoices add column if not exists discount_label text;
alter table student_invoices add column if not exists tax_label text;
alter table student_invoices add column if not exists payment_method text;
alter table student_invoices add column if not exists class_name text;

alter table student_invoices drop constraint if exists student_invoices_status_check;
alter table student_invoices add constraint student_invoices_status_check
  check (status in ('unpaid', 'partial', 'paid', 'cancelled'));

alter table invoice_discount_items enable row level security;
alter table invoice_tax_items enable row level security;
alter table invoice_remark_templates enable row level security;
alter table invoice_payment_methods enable row level security;

drop policy if exists "invoice_discount_items_admin_only" on invoice_discount_items;
create policy "invoice_discount_items_admin_only" on invoice_discount_items
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "invoice_tax_items_admin_only" on invoice_tax_items;
create policy "invoice_tax_items_admin_only" on invoice_tax_items
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "invoice_remark_templates_admin_only" on invoice_remark_templates;
create policy "invoice_remark_templates_admin_only" on invoice_remark_templates
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "invoice_payment_methods_admin_only" on invoice_payment_methods;
create policy "invoice_payment_methods_admin_only" on invoice_payment_methods
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
