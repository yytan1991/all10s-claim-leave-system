-- =========================================================
-- ALL10S ERP / WiiTeam — Parent email-code login + portal downloads (migration 36)
--
-- 1. Parents no longer set a password on the registration form. After the
--    admin approves, the parent's first login is by email: they get a code,
--    verify it, then set their own password. The same flow doubles as
--    "forgot password".
--    -> parent_accounts can exist before the parent has ever logged in
--       (user_id is filled in at first login by claim_parent_account()).
-- 2. Returning parents (a second child) are recognised by email so the
--    registration form can pre-fill their details.
-- 3. Admins can look up a student's PIN (students ask admin for it).
-- 4. Parents can download invoices and receipts (needs read access to the
--    organisation's company details and to payment records).
-- =========================================================

-- ---------- 1. parent accounts can be pre-created, claimed at first login ----------

alter table parent_accounts alter column user_id drop not null;
alter table parent_accounts add column if not exists email text;

update parent_accounts pa
set email = lower(u.email)
from auth.users u
where u.id = pa.user_id and pa.email is null;

create unique index if not exists parent_accounts_org_email_uidx
  on parent_accounts (org_id, lower(email))
  where email is not null;

-- ---------- 3. student PIN visible to admins ----------

alter table student_accounts add column if not exists pin_code text;

-- ---------- RPC: what is the registration status for this email? ----------
-- Callable before login so the login page can say "pending" / "not approved"
-- instead of silently doing nothing.

create or replace function get_parent_registration_status(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if exists (select 1 from parent_accounts pa where lower(pa.email) = lower(p_email)) then
    return 'approved';
  end if;

  select rr.status into v_status
  from registration_requests rr
  where lower(rr.parent_email) = lower(p_email)
  order by rr.created_at desc
  limit 1;

  return coalesce(v_status, 'none');
end;
$$;

-- ---------- RPC: is this a returning parent? (pre-fills the registration form) ----------
-- Only parent-section answers are returned, never anything about the child.

create or replace function lookup_returning_parent(p_org_id uuid, p_email text)
returns table (
  out_full_name text,
  out_phone text,
  out_parent_answers jsonb,
  out_has_account boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    rr.parent_full_name,
    rr.parent_phone,
    coalesce(
      (
        select jsonb_object_agg(e.key, e.value)
        from jsonb_each(rr.custom_answers) e
        where exists (
          select 1 from registration_form_fields f
          where f.id::text = e.key and f.section = 'parent' and f.org_id = p_org_id
        )
      ),
      '{}'::jsonb
    ),
    exists (
      select 1 from parent_accounts pa
      where pa.org_id = p_org_id and lower(pa.email) = lower(p_email)
    )
  from registration_requests rr
  where rr.org_id = p_org_id and lower(rr.parent_email) = lower(p_email)
  order by rr.created_at desc
  limit 1;

  if found then
    return;
  end if;

  -- Parent exists but has no registration request on file (e.g. created earlier by an admin)
  return query
  select pa.full_name, pa.phone, '{}'::jsonb, true
  from parent_accounts pa
  where pa.org_id = p_org_id and lower(pa.email) = lower(p_email)
  limit 1;
end;
$$;

-- ---------- RPC: link the logged-in user to their approved parent account ----------
-- Only works for a user whose email has actually been verified (by entering the
-- emailed code), so nobody can claim someone else's account by typing their email.

create or replace function claim_parent_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    return null;
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_confirmed is null then
    return null;
  end if;

  -- Already linked? Nothing to do.
  select pa.id into v_id from parent_accounts pa where pa.user_id = v_uid limit 1;
  if v_id is not null then
    return v_id;
  end if;

  update parent_accounts
  set user_id = v_uid
  where id = (
    select pa.id from parent_accounts pa
    where pa.user_id is null and lower(pa.email) = lower(v_email)
    order by pa.created_at
    limit 1
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- RPC: mark a newly created student login as confirmed ----------
-- Student logins use an internal address that can't receive email, so an admin
-- action confirms it directly. Restricted to org admins and to those internal
-- addresses only.

create or replace function confirm_student_login(p_student_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_org uuid;
  v_email text;
begin
  select sa.user_id, sa.org_id into v_user, v_org
  from student_accounts sa
  where sa.id = p_student_account_id;

  if v_user is null then
    raise exception 'Student account not found';
  end if;
  if not is_org_admin(v_org) then
    raise exception 'Not allowed';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;
  if v_email is null or v_email not like '%@student.portal.internal' then
    raise exception 'Not a student login';
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = v_user;
end;
$$;

grant execute on function get_parent_registration_status(text) to anon, authenticated;
grant execute on function lookup_returning_parent(uuid, text) to anon, authenticated;
grant execute on function claim_parent_account() to authenticated;
grant execute on function confirm_student_login(uuid) to authenticated;

-- ---------- 4. portal read access needed for invoice / receipt downloads ----------

drop policy if exists "portal_view_own_org" on organizations;
create policy "portal_view_own_org" on organizations
  for select using (id = current_portal_org_id());

drop policy if exists "portal_view_invoice_payments" on invoice_payments;
create policy "portal_view_invoice_payments" on invoice_payments
  for select using (
    exists (
      select 1 from student_invoices si
      where si.id = invoice_payments.invoice_id
        and (is_linked_parent_of(si.student_id) or is_own_student_account(si.student_id))
    )
  );
