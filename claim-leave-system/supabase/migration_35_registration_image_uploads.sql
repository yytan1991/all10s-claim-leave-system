-- =========================================================
-- ALL10S ERP / WiiTeam — Registration form image uploads (migration 35)
--
-- Adds a "Photo / Image upload" question type to the registration
-- form builder. Since the registration form is submitted before any
-- login exists, this bucket has to allow anonymous uploads — same
-- tradeoff any public form-with-attachments makes.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('registration-attachments', 'registration-attachments', true)
on conflict (id) do nothing;

drop policy if exists "registration_attachments_public_upload" on storage.objects;
create policy "registration_attachments_public_upload"
on storage.objects for insert
with check (bucket_id = 'registration-attachments');

drop policy if exists "registration_attachments_public_read" on storage.objects;
create policy "registration_attachments_public_read"
on storage.objects for select
using (bucket_id = 'registration-attachments');
