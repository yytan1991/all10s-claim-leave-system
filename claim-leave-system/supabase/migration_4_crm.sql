-- =========================================================
-- ALL 10S EDU — CRM module (migration 4)
-- Run this AFTER schema.sql, migration_2, and migration_3.
--
-- Merges the standalone CRM into this app: same login, same
-- profiles table. Contacts are visible to their assigned PIC
-- (person in charge) or to any manager/admin — same pattern
-- used for leave/claims visibility.
-- =========================================================

-- ---------- Pipeline stages (admin-configurable, ordered) ----------
create table if not exists crm_stages (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  sort_order int not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz default now()
);

-- ---------- Contacts / leads ----------
create table if not exists crm_contacts (
  id uuid primary key default uuid_generate_v4(),
  parent_name text not null,
  parent_contact text,
  student_name text,
  student_year text,
  school text,
  service_interested text,
  lead_source text,
  stage_id uuid references crm_stages(id),
  pic_id uuid references profiles(id),
  first_contact_date date default current_date,
  next_followup_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Follow-up history log (one contact can have many) ----------
create table if not exists crm_followups (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  followup_date date not null default current_date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Keep updated_at current on every contact edit.
create or replace function touch_crm_contact()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_crm_contact_update on crm_contacts;
create trigger on_crm_contact_update
  before update on crm_contacts
  for each row execute procedure touch_crm_contact();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table crm_stages enable row level security;
alter table crm_contacts enable row level security;
alter table crm_followups enable row level security;

-- Stages: everyone signed in can read; only admin manages the list.
create policy "crm_stages_read_all" on crm_stages
  for select using (auth.role() = 'authenticated');

create policy "crm_stages_admin_write" on crm_stages
  for all using (is_admin()) with check (is_admin());

-- Contacts: visible/editable by the assigned PIC, or any manager/admin.
create policy "crm_contacts_select_pic_or_manager" on crm_contacts
  for select using (pic_id = auth.uid() or is_manager_or_admin());

create policy "crm_contacts_insert_own_or_manager" on crm_contacts
  for insert with check (pic_id = auth.uid() or is_manager_or_admin());

create policy "crm_contacts_update_pic_or_manager" on crm_contacts
  for update using (pic_id = auth.uid() or is_manager_or_admin())
  with check (pic_id = auth.uid() or is_manager_or_admin());

create policy "crm_contacts_delete_admin" on crm_contacts
  for delete using (is_admin());

-- Follow-ups: visible/editable if the parent contact is visible to you.
create policy "crm_followups_select" on crm_followups
  for select using (
    exists (
      select 1 from crm_contacts c
      where c.id = crm_followups.contact_id
        and (c.pic_id = auth.uid() or is_manager_or_admin())
    )
  );

create policy "crm_followups_insert" on crm_followups
  for insert with check (
    exists (
      select 1 from crm_contacts c
      where c.id = crm_followups.contact_id
        and (c.pic_id = auth.uid() or is_manager_or_admin())
    )
  );

-- =========================================================
-- Seed default pipeline stages — edit freely in Settings later
-- =========================================================
insert into crm_stages (name, sort_order, is_won, is_lost) values
  ('New Lead', 1, false, false),
  ('Contacted', 2, false, false),
  ('Trial Scheduled', 3, false, false),
  ('Trial Completed', 4, false, false),
  ('Proposal Sent', 5, false, false),
  ('Closed Won', 6, true, false),
  ('Closed Lost', 7, false, true)
on conflict (name) do nothing;
