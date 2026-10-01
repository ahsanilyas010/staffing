-- ============================================================
-- Assorted Staffing — Migration 007
-- Second candidate intake: the Careers form on www.assorted.group
-- uses the same "Register Your Profile" flow as
-- staffing.assorted.group, plus a Department / Vertical choice.
--
-- - candidates.department  : which Assorted Group vertical (group careers)
-- - candidates.source_site : which website the candidate applied on
-- - candidates_before_insert() re-created: identical to 003 plus
--   validation of the two new fields. Staffing submissions are
--   unaffected (department stays optional/null for them).
--
-- Run AFTER 003. Paste and run the WHOLE file at once. Safe to re-run.
-- ============================================================

begin;

alter table public.candidates
  add column if not exists department  text,
  add column if not exists source_site text;

comment on column public.candidates.department  is 'Assorted Group vertical chosen on the group Careers form';
comment on column public.candidates.source_site is 'Website the candidate applied on (staffing.assorted.group / www.assorted.group)';

create index if not exists idx_candidates_source_site on public.candidates (source_site);

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
    new.department         := nullif(btrim(new.department), '');
    new.source_site        := nullif(lower(btrim(new.source_site)), '');

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

    -- unknown site labels are dropped rather than rejected (attribution only)
    if new.source_site is not null
       and new.source_site not in ('staffing.assorted.group', 'www.assorted.group') then
      new.source_site := null;
    end if;

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
    -- Department: required on the group Careers form, optional elsewhere
    if new.department is not null and new.department not in (
         'Assorted Staffing','Assorted Business','Assorted Coworking',
         'Assorted Produce Traders','Assorted BPO','Any / Open to Opportunities') then
      raise exception using errcode = '23514', message = 'Please choose a valid department.';
    end if;
    if new.source_site = 'www.assorted.group' and new.department is null then
      raise exception using errcode = '23514', message = 'Please choose the department you are applying to.';
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

-- create or replace keeps the existing trigger; re-assert privileges
revoke execute on function public.candidates_before_insert() from public, anon, authenticated;

commit;
