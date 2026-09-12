-- =========================================================
-- ALL 10S EDU — Team leave calendar (migration 3)
-- Run this AFTER schema.sql and migration_2_attendance.sql.
--
-- Gives every signed-in staff member visibility into who is on
-- leave and when, WITHOUT exposing private fields (reason,
-- attachment) that the existing leave_applications RLS policy
-- restricts to the applicant and managers/admins.
-- =========================================================

create or replace function get_team_leave(range_start date, range_end date)
returns table (
  id uuid,
  full_name text,
  department text,
  leave_type text,
  start_date date,
  end_date date,
  status text
) as $$
  select
    la.id,
    p.full_name,
    p.department,
    lt.name as leave_type,
    la.start_date,
    la.end_date,
    la.status
  from leave_applications la
  join profiles p on p.id = la.profile_id
  join leave_types lt on lt.id = la.leave_type_id
  where la.status in ('approved', 'pending')
    and la.start_date <= range_end
    and la.end_date >= range_start;
$$ language sql security definer stable;

grant execute on function get_team_leave(date, date) to authenticated;
