-- ============================================================
-- Assorted Staffing — Migration 004
-- Private "cvs" storage bucket for website CV uploads.
--
-- Run AFTER 003 (uses public.is_hr_user / is_hr_admin).
-- Kept separate from 003: if your project refuses storage policy
-- DDL from the SQL Editor, 003 is unaffected — create the same
-- policies in Dashboard → Storage → Policies instead.
-- ============================================================

-- Bucket: private, 10MB, PDF / DOC / DOCX only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs', 'cvs', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Drop any earlier policies that mention the cvs bucket
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%cvs%'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Website visitors may only upload new files with the generated name
-- format <13-digit ms timestamp>_<32 hex>.<pdf|doc|docx>.
-- No anon read/update/delete: a visitor cannot list or fetch any CV.
create policy "cvs_anon_upload" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'cvs'
    and name ~ '^[0-9]{13}_[a-f0-9]{32}\.(pdf|docx?)$'
  );

create policy "cvs_hr_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'cvs' and public.is_hr_user());

create policy "cvs_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cvs' and public.is_hr_admin());
