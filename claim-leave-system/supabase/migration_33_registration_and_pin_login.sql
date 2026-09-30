-- =========================================================
-- ALL10S ERP / WiiTeam — Self-service registration + PIN login (migration 33)
--
-- Replaces admin-created parent accounts with a public registration
-- form (parent + student details) that goes into a pending queue.
-- Only on admin approval do the real students / parent_accounts /
-- parent_student_links rows get created.
--
-- Students no longer use email+password at all — each gets a short
-- Login Code + PIN. Behind the scenes this still maps to a real
-- Supabase Auth account (so RLS keeps working exactly like everywhere
-- else), but the student never sees or types an email.
-- =========================================================

create table if not exists registration_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),

  parent_full_name text not null,
  parent_email text not null,
  parent_phone text,
  parent_auth_user_id uuid references auth.users(id),

  student_full_name text not null,
  student_dob date,
  student_notes text,

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists registration_requests_org_status_idx on registration_requests (org_id, status);

alter table student_accounts add column if not exists login_code text unique;

-- =========================================================
-- RLS: registration_requests
-- Anyone (not logged in) can submit a request — this is the public
-- registration form. Only org admins can read/review/approve/reject.
-- The parent who submitted it can also check their own request's
-- status (matched via their own auth user id, once their Auth
-- account exists) so the portal can show "pending" / "rejected".
-- =========================================================

alter table registration_requests enable row level security;

drop policy if exists "registration_requests_public_insert" on registration_requests;
create policy "registration_requests_public_insert" on registration_requests
  for insert with check (true);

drop policy if exists "registration_requests_admin_read" on registration_requests;
create policy "registration_requests_admin_read" on registration_requests
  for select using (is_org_admin(org_id) or parent_auth_user_id = auth.uid());

drop policy if exists "registration_requests_admin_update" on registration_requests;
create policy "registration_requests_admin_update" on registration_requests
  for update using (is_org_admin(org_id));

drop policy if exists "registration_requests_admin_delete" on registration_requests;
create policy "registration_requests_admin_delete" on registration_requests
  for delete using (is_org_admin(org_id));
