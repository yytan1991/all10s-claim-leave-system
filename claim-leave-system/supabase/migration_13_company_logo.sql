-- =========================================================
-- ALL10S ERP — Company logo for payslips (migration 13)
-- =========================================================

alter table organizations add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

-- Path convention: <org_id>/logo.<ext> — org admin manages their own folder.
drop policy if exists "company_logo_upload_admin" on storage.objects;
create policy "company_logo_upload_admin" on storage.objects
  for insert with check (
    bucket_id = 'company-logos' and is_org_admin((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "company_logo_update_admin" on storage.objects;
create policy "company_logo_update_admin" on storage.objects
  for update using (
    bucket_id = 'company-logos' and is_org_admin((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "company_logo_delete_admin" on storage.objects;
create policy "company_logo_delete_admin" on storage.objects
  for delete using (
    bucket_id = 'company-logos' and is_org_admin((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "company_logo_read_all" on storage.objects;
create policy "company_logo_read_all" on storage.objects
  for select using (bucket_id = 'company-logos');
