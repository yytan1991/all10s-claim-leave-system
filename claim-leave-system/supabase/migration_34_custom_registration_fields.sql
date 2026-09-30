-- =========================================================
-- ALL10S ERP / WiiTeam — Customizable registration form (migration 34)
--
-- The core fields (parent name/email/phone/password, student name)
-- stay fixed since they're structurally required. Everything else
-- is now admin-configurable: add, edit, remove, and reorder extra
-- questions, shown under either the Parent or Student section of
-- the public form. Answers to these are stored as a flexible JSON
-- blob rather than fixed columns.
-- =========================================================

create table if not exists registration_form_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  section text not null default 'student' check (section in ('parent', 'student')),
  label text not null,
  field_type text not null default 'text' check (field_type in ('text', 'textarea', 'number', 'date', 'select')),
  options jsonb, -- array of strings, only used when field_type = 'select'
  required boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create index if not exists registration_form_fields_org_idx on registration_form_fields (org_id, section, sort_order);

alter table registration_requests add column if not exists custom_answers jsonb not null default '{}';

alter table registration_form_fields enable row level security;

-- Public form needs to read the field configuration without being logged in.
drop policy if exists "registration_form_fields_public_read" on registration_form_fields;
create policy "registration_form_fields_public_read" on registration_form_fields
  for select using (true);

drop policy if exists "registration_form_fields_admin_write" on registration_form_fields;
create policy "registration_form_fields_admin_write" on registration_form_fields
  for insert with check (is_org_admin(org_id));
drop policy if exists "registration_form_fields_admin_update" on registration_form_fields;
create policy "registration_form_fields_admin_update" on registration_form_fields
  for update using (is_org_admin(org_id));
drop policy if exists "registration_form_fields_admin_delete" on registration_form_fields;
create policy "registration_form_fields_admin_delete" on registration_form_fields
  for delete using (is_org_admin(org_id));
