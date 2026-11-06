-- =========================================================
-- ALL10S ERP / WiiTeam — Student profile fields and archive (migration 42)
--
--  * Students get a date of birth and a parent email.
--  * Students can be archived (hidden from the list, no more automatic invoices)
--    and restored later.
-- =========================================================

alter table students add column if not exists date_of_birth date;
alter table students add column if not exists parent_email text;
alter table students add column if not exists archived_at timestamptz;

create index if not exists students_archived_idx on students (org_id, archived_at);

-- Fill in the parent email for students who came through registration approval.
update students s
set parent_email = pa.email
from parent_student_links l
join parent_accounts pa on pa.id = l.parent_account_id
where l.student_id = s.id
  and s.parent_email is null
  and pa.email is not null;

-- The daily invoice job (same as before) now skips archived students.
create or replace function generate_due_recurring_invoices()
returns void as $$
declare
  plan record;
  new_next_date date;
begin
  for plan in
    select * from recurring_invoice_plans
    where active = true
      and next_generation_date <= current_date
      and not exists (
        select 1 from students s
        where s.id = recurring_invoice_plans.student_id and s.archived_at is not null
      )
  loop
    insert into public.student_invoices (
      org_id, student_id, description, items, amount, subtotal,
      due_date, issue_date, invoice_month, created_by
    )
    values (
      plan.org_id,
      plan.student_id,
      (plan.items->0->>'description'),
      plan.items,
      plan.amount,
      plan.amount,
      plan.next_generation_date,
      plan.next_generation_date,
      coalesce(plan.next_invoice_month, to_char(plan.next_generation_date, 'FMMonth YYYY')),
      plan.created_by
    );

    new_next_date := plan.next_generation_date + (plan.recurrence_interval_months || ' months')::interval;

    update recurring_invoice_plans
    set next_generation_date = new_next_date,
        next_invoice_month = to_char(new_next_date, 'FMMonth YYYY')
    where id = plan.id;
  end loop;
end;
$$ language plpgsql security definer
set search_path = public;
