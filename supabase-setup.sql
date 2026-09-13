-- ============================================================
-- Assorted Staffing — Supabase Setup (Phase 1)
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. CANDIDATES TABLE
create table if not exists public.candidates (
  id                  uuid        default gen_random_uuid() primary key,
  created_at          timestamptz default now(),
  first_name          text        not null,
  last_name           text        not null,
  email               text        not null,
  phone               text,
  country             text,
  relocation_pref     text,
  preferred_role      text,
  experience_years    text,
  salary_expectation  text,
  cv_file_path        text,        -- path inside the "cvs" storage bucket
  cv_file_name        text,        -- original filename
  consent             boolean     default false,
  status              text        default 'new'   -- 'new' | 'reviewing' | 'shortlisted' | 'placed'
);

-- 2. ROW LEVEL SECURITY
alter table public.candidates enable row level security;

-- Anyone (including unauthenticated website visitors) can INSERT
create policy "allow_public_insert"
  on public.candidates
  for insert
  to anon
  with check (true);

-- Only authenticated users (CRM / admin) can SELECT
create policy "allow_authenticated_read"
  on public.candidates
  for select
  to authenticated
  using (true);

-- Only authenticated users can UPDATE (e.g. change status in CRM)
create policy "allow_authenticated_update"
  on public.candidates
  for update
  to authenticated
  using (true);

-- ============================================================
-- 3. STORAGE BUCKET
-- Run this separately, or create the bucket via:
-- Dashboard → Storage → New bucket → name: "cvs", Public: OFF
-- ============================================================

-- insert into storage.buckets (id, name, public)
-- values ('cvs', 'cvs', false)
-- on conflict do nothing;

-- Allow anonymous uploads into the cvs bucket
-- create policy "allow_anon_upload"
--   on storage.objects
--   for insert
--   to anon
--   with check (bucket_id = 'cvs');

-- Only authenticated users can read/download CVs
-- create policy "allow_authenticated_download"
--   on storage.objects
--   for select
--   to authenticated
--   using (bucket_id = 'cvs');

-- NOTE: Uncomment and run the storage policies above after creating the bucket.
-- Storage policies live in a separate schema — paste them in a second SQL query
-- if the first one errors on the storage.objects lines.
