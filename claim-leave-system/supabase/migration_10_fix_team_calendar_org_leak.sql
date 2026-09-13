-- =========================================================
-- ALL10S ERP — Fix team calendar cross-org leak (migration 10)
--
-- get_team_leave() is SECURITY DEFINER, meaning it bypasses RLS
-- entirely. Before this fix, it returned leave records from EVERY
-- organization with no filtering — harmless with a single tenant,
-- but a real cross-company data leak now that multiple orgs and
-- multi-membership logins exist. This adds an org_id parameter and
-- restricts results to it, and only for orgs the caller actually
-- belongs to.
-- =========================================================

drop function if exists get_team_leave(date, date);

create or replace function get_team_leave(range_start date, range_end date, p_org_id uuid)
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
    and la.org_id = p_org_id
    and has_profile_in_org(p_org_id)
    and la.start_date <= range_end
    and la.end_date >= range_start;
$$ language sql security definer stable;

grant execute on function get_team_leave(date, date, uuid) to authenticated;
