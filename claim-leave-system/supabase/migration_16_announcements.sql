-- =========================================================
-- ALL10S ERP — Announcements (migration 16)
--
-- Org-wide announcement board. Rich text body (formatted with a
-- WYSIWYG editor: fonts, sizes, alignment, emoji) plus attached
-- images/videos, stored separately from the text so uploads don't
-- need a custom rich-text embed format.
-- =========================================================

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null,
  body_html text not null default '',
  media jsonb not null default '[]',   -- [{ "type": "image"|"video", "url": "...", "name": "..." }]
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists announcements_org_created_idx on announcements (org_id, created_at desc);

create or replace function touch_announcement()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists on_announcement_update on announcements;
create trigger on_announcement_update
  before update on announcements
  for each row execute procedure touch_announcement();

-- ---------- Storage bucket for images/videos ----------
insert into storage.buckets (id, name, public)
values ('announcement-media', 'announcement-media', true)
on conflict (id) do nothing;

drop policy if exists "announcement_media_upload_manager" on storage.objects;
create policy "announcement_media_upload_manager" on storage.objects
  for insert with check (
    bucket_id = 'announcement-media' and is_org_manager_or_admin((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "announcement_media_delete_manager" on storage.objects;
create policy "announcement_media_delete_manager" on storage.objects
  for delete using (
    bucket_id = 'announcement-media' and is_org_manager_or_admin((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "announcement_media_read_all" on storage.objects;
create policy "announcement_media_read_all" on storage.objects
  for select using (bucket_id = 'announcement-media');

-- =========================================================
-- Row Level Security
-- =========================================================
alter table announcements enable row level security;

drop policy if exists "announcements_read_all" on announcements;
create policy "announcements_read_all" on announcements
  for select using (has_profile_in_org(org_id));

drop policy if exists "announcements_manager_write" on announcements;
create policy "announcements_manager_write" on announcements
  for all using (is_org_manager_or_admin(org_id)) with check (is_org_manager_or_admin(org_id));
