-- =========================================================
-- ALL10S ERP — Announcement pinning + audience targeting (migration 17)
--
-- target_groups is forward-compatible: "students" won't actually
-- reach anyone until the student portal exists, but posts made now
-- are already correctly tagged for when it does.
-- =========================================================

alter table announcements add column if not exists pinned boolean not null default false;
alter table announcements add column if not exists target_groups text[] not null default '{staff}';

create index if not exists announcements_pinned_idx on announcements (org_id, pinned, created_at desc);
