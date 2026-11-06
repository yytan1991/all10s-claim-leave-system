-- =========================================================
-- ALL10S ERP / WiiTeam — Teacher phone number and archive (migration 43)
--
--  * Staff get a phone number (shown and edited on the Teachers page).
--  * A teacher can be archived: hidden from the Teachers list and taken off
--    their classes. Their staff account is NOT touched — archiving does not
--    block them from signing in.
-- =========================================================

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists archived_at timestamptz;
