-- ============================================================
-- Assorted Staffing — Migration 005
-- Client requirements: "Hire Talent" popup form on the website
-- → public.client_requirements (shown later in the HRM
--   "Client Requirements" tab).
--
-- Run AFTER 003 (uses is_hr_user / hr_can_write / is_hr_admin).
-- Paste and run the WHOLE file at once. Safe to re-run.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- A. TABLE
--    CHECK constraints are safe here: the table is new, so there
--    is no legacy data to trip them. They protect HR-side edits
--    too; the trigger below adds website-specific rules.
-- ────────────────────────────────────────────────────────────
create table if not exists public.client_requirements (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- what the employer submitted
  contact_name  text        not null check (char_length(contact_name) between 2 and 100),
  company_name  text        not null check (char_length(company_name) between 2 and 150),
  email         text        not null check (char_length(email) <= 254
                                            and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text        not null check (phone ~ '^\+?[0-9 ()\-]{7,20}$'),
  country       text        not null check (char_length(country) between 2 and 100),
  roles         text        not null check (char_length(roles) between 2 and 500),
  headcount     int         not null check (headcount between 1 and 1000),
  hiring_type   text        not null check (hiring_type in
                              ('Permanent','Contract','Executive','Offshore Team','RPO')),
  urgency       text        not null check (urgency in
                              ('ASAP','Within 1 month','Just exploring')),
  message       text                 check (message is null or char_length(message) <= 2000),

  -- where it came from
  source        text        not null default 'website_form',
  source_cta    text                 check (source_cta is null or source_cta in
                              ('nav_hire_talent','hero_hire_talent_now','cta_discuss_hire',
                               'footer_consultation','footer_rpo')),

  -- HR workflow (managed in the HRM tab)
  status        text        not null default 'new' check (status in
                              ('new','contacted','qualified','proposal_sent','won','lost')),
  assigned_to   uuid        references public.hr_users(id) on delete set null
);

create index if not exists idx_client_requirements_created on public.client_requirements (created_at desc);
create index if not exists idx_client_requirements_status  on public.client_requirements (status);
create index if not exists idx_client_requirements_email   on public.client_requirements (lower(email));

-- ────────────────────────────────────────────────────────────
-- B. INTAKE TRIGGER — website (anon) inserts are normalized,
--    validated with friendly messages, and server-owned fields
--    are forced. HR inserts/updates are left alone.
-- ────────────────────────────────────────────────────────────
create or replace function public.client_requirements_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'anon' then
    -- normalize
    new.contact_name := nullif(btrim(new.contact_name), '');
    new.company_name := nullif(btrim(new.company_name), '');
    new.email        := nullif(lower(btrim(new.email)), '');
    new.phone        := nullif(btrim(new.phone), '');
    new.country      := nullif(btrim(new.country), '');
    new.roles        := nullif(btrim(new.roles), '');
    new.hiring_type  := nullif(btrim(new.hiring_type), '');
    new.urgency      := nullif(btrim(new.urgency), '');
    new.message      := nullif(btrim(new.message), '');
    new.source_cta   := nullif(btrim(new.source_cta), '');

    -- server-owned fields: never trust the client
    new.id          := gen_random_uuid();
    new.created_at  := now();
    new.updated_at  := now();
    new.source      := 'website_form';
    new.status      := 'new';
    new.assigned_to := null;

    -- validation (23514 = check_violation; message is shown to the visitor)
    if new.contact_name is null or char_length(new.contact_name) not between 2 and 100 then
      raise exception using errcode = '23514', message = 'Please enter your name (2–100 characters).';
    end if;
    if new.company_name is null or char_length(new.company_name) not between 2 and 150 then
      raise exception using errcode = '23514', message = 'Please enter your company name (2–150 characters).';
    end if;
    if new.email is null or char_length(new.email) > 254
       or new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception using errcode = '23514', message = 'Please enter a valid email address.';
    end if;
    if new.phone is null or new.phone !~ '^\+?[0-9 ()\-]{7,20}$' then
      raise exception using errcode = '23514', message = 'Please enter a valid phone / WhatsApp number (digits, spaces, +, -, brackets; 7–20 characters).';
    end if;
    if new.country is null or new.country not in (
         'United Kingdom','United Arab Emirates','United States','Saudi Arabia',
         'Canada','Australia','Germany','Singapore','Pakistan','Other') then
      raise exception using errcode = '23514', message = 'Please select your country.';
    end if;
    if new.roles is null or char_length(new.roles) not between 2 and 500 then
      raise exception using errcode = '23514', message = 'Please describe the role(s) you want to hire (2–500 characters).';
    end if;
    if new.headcount is null or new.headcount not between 1 and 1000 then
      raise exception using errcode = '23514', message = 'Number of people must be between 1 and 1000.';
    end if;
    if new.hiring_type is null or new.hiring_type not in
         ('Permanent','Contract','Executive','Offshore Team','RPO') then
      raise exception using errcode = '23514', message = 'Please choose a hiring type.';
    end if;
    if new.urgency is null or new.urgency not in ('ASAP','Within 1 month','Just exploring') then
      raise exception using errcode = '23514', message = 'Please choose how urgent this hire is.';
    end if;
    if new.message is not null and char_length(new.message) > 2000 then
      raise exception using errcode = '23514', message = 'Message must be 2000 characters or fewer.';
    end if;
    if new.source_cta is not null and new.source_cta not in
         ('nav_hire_talent','hero_hire_talent_now','cta_discuss_hire',
          'footer_consultation','footer_rpo') then
      new.source_cta := null;
    end if;

    -- duplicate guard: identical email + company within 10 minutes
    -- (double-clicks / resubmits). A company may legitimately send
    -- several different requirements, so the window is short.
    perform pg_advisory_xact_lock(hashtext('client_req:' || new.email));
    if exists (select 1 from public.client_requirements r
               where lower(r.email) = new.email
                 and lower(r.company_name) = lower(new.company_name)
                 and r.created_at > now() - interval '10 minutes') then
      raise exception using errcode = '23505', message = 'DUPLICATE_SUBMISSION';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_client_requirements_before_insert on public.client_requirements;
create trigger trg_client_requirements_before_insert
  before insert on public.client_requirements
  for each row execute function public.client_requirements_before_insert();

-- keep updated_at current for HR edits
create or replace function public.client_requirements_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_client_requirements_touch on public.client_requirements;
create trigger trg_client_requirements_touch
  before update on public.client_requirements
  for each row execute function public.client_requirements_touch();

revoke execute on function public.client_requirements_before_insert(),
                           public.client_requirements_touch()
  from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- C. RLS — website may only INSERT; HR reads; non-viewers edit
-- ────────────────────────────────────────────────────────────
alter table public.client_requirements enable row level security;

do $$
declare
  r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'client_requirements'
  loop
    execute format('drop policy if exists %I on public.client_requirements', r.policyname);
  end loop;
end $$;

create policy "website_form_insert_requirements" on public.client_requirements
  for insert to anon
  with check (source = 'website_form' and status = 'new' and assigned_to is null);
create policy "hr_read_requirements" on public.client_requirements
  for select to authenticated using (public.is_hr_user());
create policy "hr_insert_requirements" on public.client_requirements
  for insert to authenticated with check (public.hr_can_write());
create policy "hr_update_requirements" on public.client_requirements
  for update to authenticated using (public.hr_can_write()) with check (public.hr_can_write());
create policy "admin_delete_requirements" on public.client_requirements
  for delete to authenticated using (public.is_hr_admin());

-- Table privileges (Supabase grants these by default; explicit for clarity).
-- anon gets INSERT only — no SELECT, so submissions can't be read back.
revoke all on public.client_requirements from anon;
grant insert on public.client_requirements to anon;
grant select, insert, update, delete on public.client_requirements to authenticated;

commit;
