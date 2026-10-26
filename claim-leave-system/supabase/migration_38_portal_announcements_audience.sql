-- =========================================================
-- ALL10S ERP / WiiTeam — Portals only see announcements meant for them (migration 38)
--
-- The portal policy from migration 32 let parents and students read EVERY
-- announcement in the centre, including staff-only ones. Now they can only read
-- announcements that include the "students" audience (shown on the form as
-- "Students & parents").
-- =========================================================

drop policy if exists "portal_view_announcements" on announcements;
create policy "portal_view_announcements" on announcements
  for select using (
    org_id = current_portal_org_id()
    and to_jsonb(target_groups) @> '["students"]'::jsonb
  );
