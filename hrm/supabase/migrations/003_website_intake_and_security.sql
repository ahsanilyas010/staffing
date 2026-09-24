-- ============================================================
-- Assorted Staffing — Migration 003
-- Website "Register Your Profile" intake + HR-only access
--
-- Run in: Supabase Dashboard → SQL Editor → New query.
-- Paste and run the WHOLE file at once (Ctrl+A). Do not run sections
-- separately: the policies in E/F call helper functions from section A.
-- Safe to re-run: every object is dropped/replaced idempotently.
--
-- PREREQUISITE: at least one row in public.hr_users for your own
-- login, otherwise the dashboard will show no data after this runs
-- (see SETUP.md Step 5). Nothing is deleted — adding the hr_users
-- row afterwards restores access.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- A. HELPERS — who is an HR user / what role
--    security definer so policies on hr_users don't recurse.
-- ────────────────────────────────────────────────────────────
create or replace function public.hr_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.hr_users where id = auth.uid()
$$;

create or replace function public.is_hr_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.hr_users where id = auth.uid())
$$;

create or replace function public.is_hr_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.hr_role() = 'admin', false)
$$;

-- viewer = read-only; every other role may edit candidates / pipeline / notes
create or replace function public.hr_can_write()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.hr_role() in ('admin','recruiter','hiring_manager'), false)
$$;

revoke execute on function public.hr_role(), public.is_hr_user(), public.is_hr_admin(), public.hr_can_write() from public, anon;
grant  execute on function public.hr_role(), public.is_hr_user(), public.is_hr_admin(), public.hr_can_write() to authenticated;

-- ────────────────────────────────────────────────────────────
-- A2. SIGN-UP TRIGGER (on_auth_user_created → handle_new_user)
--     Keeps its behaviour (new auth user → hr_users row, 'viewer'
--     unless a pre-approved admin email) but pins search_path and
--     stops it being callable directly. Because every auth user
--     becomes a viewer, public sign-up MUST be disabled.
-- ────────────────────────────────────────────────────────────
alter function public.handle_new_user() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Notes: record who wrote them (the dashboard doesn't send author_id)
alter table public.notes alter column author_id set default auth.uid();

-- ────────────────────────────────────────────────────────────
-- B. INTAKE — BEFORE INSERT on candidates
--    Website submissions (anon) are normalized, validated and
--    have every server-owned field forced. HR/admin inserts
--    only get a default stage. UPDATEs are never touched, so
--    imported rows with legacy data keep working on the board.
-- ────────────────────────────────────────────────────────────
create or replace function public.candidates_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_applied_stage uuid;
begin
  select id into v_applied_stage
  from public.pipeline_stages
  where stage_type = 'applied'
  order by order_index
  limit 1;

  if coalesce(auth.role(), '') = 'anon' then
    -- normalize
    new.first_name         := nullif(btrim(new.first_name), '');
    new.last_name          := nullif(btrim(new.last_name), '');
    new.email              := nullif(lower(btrim(new.email)), '');
    new.phone              := nullif(btrim(new.phone), '');
    new.country            := nullif(btrim(new.country), '');
    new.relocation_pref    := nullif(btrim(new.relocation_pref), '');
    new.preferred_role     := nullif(btrim(new.preferred_role), '');
    new.experience_years   := nullif(btrim(new.experience_years), '');
    new.salary_expectation := nullif(btrim(new.salary_expectation), '');
    new.linkedin_url       := nullif(btrim(new.linkedin_url), '');
    new.cv_file_path       := nullif(btrim(new.cv_file_path), '');
    new.cv_file_name       := nullif(btrim(new.cv_file_name), '');

    -- server-owned fields: never trust the client
    new.id               := gen_random_uuid();
    new.status           := 'new';
    new.source           := 'website_form';
    new.stage_id         := v_applied_stage;
    new.assigned_to      := null;
    new.overall_score    := null;
    new.notes_count      := 0;
    new.skills           := '{}';
    new.created_at       := now();
    new.last_activity_at := now();

    -- validation (23514 = check_violation; message is shown to the candidate)
    if new.first_name is null or length(new.first_name) > 80 then
      raise exception using errcode = '23514', message = 'Please enter your first name (max 80 characters).';
    end if;
    if new.last_name is null or length(new.last_name) > 80 then
      raise exception using errcode = '23514', message = 'Please enter your last name (max 80 characters).';
    end if;
    if new.email is null or length(new.email) > 254
       or new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception using errcode = '23514', message = 'Please enter a valid email address.';
    end if;
    if new.phone is null or new.phone !~ '^\+?[0-9 ()\-]{7,20}$' then
      raise exception using errcode = '23514', message = 'Please enter a valid phone number (digits, spaces, +, -, brackets; 7–20 characters).';
    end if;
    if new.country is null or new.country not in (
         'United Kingdom','United Arab Emirates','United States','Saudi Arabia',
         'Canada','Australia','Germany','Singapore','Pakistan','Other') then
      raise exception using errcode = '23514', message = 'Please select your current location.';
    end if;
    if new.relocation_pref is not null and new.relocation_pref not in (
         'Yes — Internationally','Yes — Regionally','No — Remote Only') then
      raise exception using errcode = '23514', message = 'Please choose a valid relocation option.';
    end if;
    if new.preferred_role is null or length(new.preferred_role) < 2 or length(new.preferred_role) > 200 then
      raise exception using errcode = '23514', message = 'Please enter your preferred role or sector (2–200 characters).';
    end if;
    if new.experience_years is not null and new.experience_years not in (
         '0-1 years','1-3 years','3-5 years','5-10 years','10+ years') then
      raise exception using errcode = '23514', message = 'Please choose a valid experience range.';
    end if;
    if new.salary_expectation is not null and length(new.salary_expectation) > 100 then
      raise exception using errcode = '23514', message = 'Expected salary must be 100 characters or fewer.';
    end if;
    if new.linkedin_url is not null and (
         length(new.linkedin_url) > 300
         or new.linkedin_url !~* '^https://([a-z]{2,3}\.)?linkedin\.com/') then
      raise exception using errcode = '23514', message = 'LinkedIn URL must start with https://www.linkedin.com/';
    end if;
    if new.consent is not true then
      raise exception using errcode = '23514', message = 'Please tick the consent box to continue.';
    end if;
    if new.cv_file_path is null
       or new.cv_file_path !~ '^[0-9]{13}_[a-f0-9]{32}\.(pdf|docx?)$'
       or not exists (select 1 from storage.objects o
                      where o.bucket_id = 'cvs' and o.name = new.cv_file_path) then
      raise exception using errcode = '23514', message = 'Please upload your CV (PDF, DOC or DOCX, max 10MB).';
    end if;
    if exists (select 1 from public.candidates c where c.cv_file_path = new.cv_file_path) then
      raise exception using errcode = '23514', message = 'Please upload your CV again.';
    end if;
    if new.cv_file_name is null or length(new.cv_file_name) > 255 then
      new.cv_file_name := left(coalesce(new.cv_file_name, new.cv_file_path), 255);
    end if;

    -- duplicate guard: same email within 24h (lock serializes concurrent submits)
    perform pg_advisory_xact_lock(hashtext('candidate_email:' || new.email));
    if exists (select 1 from public.candidates c
               where lower(btrim(c.email)) = new.email
                 and c.created_at > now() - interval '24 hours') then
      raise exception using errcode = '23505', message = 'DUPLICATE_SUBMISSION';
    end if;
  end if;

  if new.stage_id is null then
    new.stage_id := v_applied_stage;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_candidates_before_insert on public.candidates;
create trigger trg_candidates_before_insert
  before insert on public.candidates
  for each row execute function public.candidates_before_insert();

-- ────────────────────────────────────────────────────────────
-- C. AFTER INSERT — every candidate gets an application row
-- ────────────────────────────────────────────────────────────
create or replace function public.candidates_after_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.applications (candidate_id, stage_id, source)
  select new.id, new.stage_id, coalesce(new.source, 'website_form')
  where not exists (select 1 from public.applications a where a.candidate_id = new.id);
  return null;
end;
$$;

drop trigger if exists trg_candidates_after_insert on public.candidates;
create trigger trg_candidates_after_insert
  after insert on public.candidates
  for each row execute function public.candidates_after_insert();

revoke execute on function public.candidates_before_insert(), public.candidates_after_insert(),
                           public.update_notes_count()
  from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- D. BACKFILL — website rows that arrived without a stage
-- ────────────────────────────────────────────────────────────
update public.candidates
set stage_id = (select id from public.pipeline_stages where stage_type = 'applied' order by order_index limit 1)
where stage_id is null;

insert into public.applications (candidate_id, stage_id, source)
select c.id, c.stage_id, coalesce(c.source, 'website_form')
from public.candidates c
where not exists (select 1 from public.applications a where a.candidate_id = c.id);

-- ────────────────────────────────────────────────────────────
-- E + F. RLS — drop every existing policy on HRM tables and
--        rebuild: anon may only INSERT a candidate; everything
--        else requires a row in hr_users.
-- ────────────────────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('candidates','pipeline_stages','hr_users','jobs','applications',
                        'interviews','interview_transcripts','notes','tags',
                        'candidate_tags','email_templates')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- candidates
alter table public.candidates enable row level security;
create policy "website_form_insert" on public.candidates
  for insert to anon
  with check (consent is true and source = 'website_form' and status = 'new' and assigned_to is null);
create policy "hr_select_candidates" on public.candidates
  for select to authenticated using (public.is_hr_user());
create policy "hr_insert_candidates" on public.candidates
  for insert to authenticated with check (public.hr_can_write());
create policy "hr_update_candidates" on public.candidates
  for update to authenticated using (public.hr_can_write()) with check (public.hr_can_write());
create policy "admin_delete_candidates" on public.candidates
  for delete to authenticated using (public.is_hr_admin());

-- pipeline_stages
create policy "hr_read_stages" on public.pipeline_stages
  for select to authenticated using (public.is_hr_user());
create policy "admin_write_stages" on public.pipeline_stages
  for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());

-- hr_users (no self-insert / self-update: that allowed promoting yourself to admin)
create policy "users_read_own" on public.hr_users
  for select to authenticated using (auth.uid() = id);
create policy "hr_read_users" on public.hr_users
  for select to authenticated using (public.is_hr_user());
create policy "admin_write_users" on public.hr_users
  for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());

-- jobs
create policy "hr_read_jobs" on public.jobs
  for select to authenticated using (public.is_hr_user());
create policy "hr_insert_jobs" on public.jobs
  for insert to authenticated with check (public.hr_can_write());
create policy "hr_update_jobs" on public.jobs
  for update to authenticated using (public.hr_can_write()) with check (public.hr_can_write());

-- HR working tables: every HR user reads, viewers can't write
do $$
declare
  t text;
begin
  foreach t in array array['applications','interviews','interview_transcripts',
                           'notes','tags','candidate_tags']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_hr_user())',
                   'hr_read_' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.hr_can_write())',
                   'hr_insert_' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.hr_can_write()) with check (public.hr_can_write())',
                   'hr_update_' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.hr_can_write())',
                   'hr_delete_' || t, t);
  end loop;
end $$;

-- email_templates
create policy "hr_read_templates" on public.email_templates
  for select to authenticated using (public.is_hr_user());
create policy "recruiter_write_templates" on public.email_templates
  for all to authenticated
  using (public.hr_role() in ('admin','recruiter'))
  with check (public.hr_role() in ('admin','recruiter'));

-- ────────────────────────────────────────────────────────────
-- G. RPC LOCKDOWN — run as the caller so RLS applies,
--    and not callable by anonymous visitors.
-- ────────────────────────────────────────────────────────────
-- Looked up by name so it works whatever argument list the live functions have
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('advance_candidate_stage', 'pipeline_summary')
  loop
    execute format('alter function %s security invoker', f);
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

-- After running: Authentication → Sign In / Providers → turn OFF
-- "Allow new users to sign up". HR staff are invited instead.
