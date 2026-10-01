-- ============================================================
-- Assorted Staffing — Recruitment HRM Schema
-- Migration 001: Full HRM database foundation
-- Run this in Supabase SQL Editor after the existing
-- supabase-setup.sql has been applied.
-- ============================================================

-- NOTE: policies below are the original Phase-1 policies. Migration
-- 003 replaces them all with HR-only (is_hr_user) policies — always
-- run 003 and 004 after this file.

-- ────────────────────────────────────────────────────────────
-- 1. HR USERS (maps to Supabase Auth)
--    Created first: the pipeline_stages admin policy references it.
-- ────────────────────────────────────────────────────────────
create table if not exists public.hr_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'recruiter' check (role in (
    'admin','recruiter','hiring_manager','viewer'
  )),
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table public.hr_users enable row level security;

create policy "users_read_own"  on public.hr_users for select to authenticated using (auth.uid() = id);
create policy "users_read_all"  on public.hr_users for select to authenticated using (true);
create policy "users_insert"    on public.hr_users for insert to authenticated with check (auth.uid() = id);
create policy "users_update_own" on public.hr_users for update to authenticated using (auth.uid() = id);

-- ────────────────────────────────────────────────────────────
-- 2. PIPELINE STAGES (seed before adding FK to candidates)
-- ────────────────────────────────────────────────────────────
create table if not exists public.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  order_index  int  not null,
  color        text not null default '#6366f1',
  stage_type   text not null check (stage_type in (
    'applied','cv_review','ai_interview','hr_interview',
    'technical','final_interview','offer','hired','rejected'
  )),
  created_at   timestamptz default now()
);

alter table public.pipeline_stages enable row level security;

create policy "hr_read_stages"   on public.pipeline_stages for select to authenticated using (true);
create policy "admin_write_stages" on public.pipeline_stages for all to authenticated
  using ( (select role from public.hr_users where id = auth.uid()) = 'admin' )
  with check ( (select role from public.hr_users where id = auth.uid()) = 'admin' );

-- Default stages
insert into public.pipeline_stages (name, order_index, color, stage_type) values
  ('New Application',     1, '#94a3b8', 'applied'),
  ('CV Review',           2, '#60a5fa', 'cv_review'),
  ('AI Phone Screen',     3, '#a78bfa', 'ai_interview'),
  ('HR Interview',        4, '#34d399', 'hr_interview'),
  ('Technical Assessment',5, '#fbbf24', 'technical'),
  ('Final Interview',     6, '#f97316', 'final_interview'),
  ('Offer Sent',          7, '#06b6d4', 'offer'),
  ('Hired',               8, '#22c55e', 'hired'),
  ('Rejected',            9, '#f43f5e', 'rejected')
on conflict do nothing;

-- ────────────────────────────────────────────────────────────
-- 3. EXTEND EXISTING candidates TABLE
-- ────────────────────────────────────────────────────────────
alter table public.candidates
  add column if not exists source           text default 'website_form',
  add column if not exists linkedin_url     text,
  add column if not exists skills           text[] default '{}',
  add column if not exists notes_count      int  default 0,
  add column if not exists last_activity_at timestamptz default now(),
  add column if not exists assigned_to      uuid references public.hr_users(id),
  add column if not exists overall_score    numeric(3,1),
  add column if not exists stage_id         uuid references public.pipeline_stages(id);

-- Backfill stage_id: put all existing candidates in "New Application"
update public.candidates
set stage_id = (select id from public.pipeline_stages where stage_type = 'applied' limit 1)
where stage_id is null;

-- Add authenticated SELECT policy (anon already has INSERT from setup.sql)
create policy "hr_read_candidates" on public.candidates
  for select to authenticated using (true);

create policy "hr_update_candidates" on public.candidates
  for update to authenticated using (true);

-- ────────────────────────────────────────────────────────────
-- 4. JOBS
-- ────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  department   text,
  location     text,
  type         text not null default 'permanent' check (type in (
    'permanent','contract','executive','temp'
  )),
  salary_min   numeric,
  salary_max   numeric,
  currency     text default 'USD',
  description  text,
  requirements text[] default '{}',
  status       text not null default 'open' check (status in (
    'open','paused','filled','cancelled'
  )),
  created_by   uuid references public.hr_users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.jobs enable row level security;

create policy "hr_read_jobs"   on public.jobs for select to authenticated using (true);
create policy "hr_write_jobs"  on public.jobs for insert to authenticated with check (true);
create policy "hr_update_jobs" on public.jobs for update to authenticated using (true);

-- ────────────────────────────────────────────────────────────
-- 5. APPLICATIONS (candidate ↔ job link)
-- ────────────────────────────────────────────────────────────
create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid not null references public.candidates(id) on delete cascade,
  job_id           uuid references public.jobs(id),
  applied_at       timestamptz default now(),
  stage_id         uuid references public.pipeline_stages(id),
  status           text not null default 'active' check (status in (
    'active','rejected','hired','withdrawn'
  )),
  source           text,
  rejection_reason text,
  hired_at         timestamptz,
  assigned_to      uuid references public.hr_users(id)
);

alter table public.applications enable row level security;

create policy "hr_all_applications" on public.applications for all to authenticated using (true) with check (true);

-- Backfill: create an application record for every existing candidate
insert into public.applications (candidate_id, stage_id, source)
select
  c.id,
  c.stage_id,
  'website_form'
from public.candidates c
where not exists (
  select 1 from public.applications a where a.candidate_id = c.id
);

-- ────────────────────────────────────────────────────────────
-- 6. INTERVIEWS
-- ────────────────────────────────────────────────────────────
create table if not exists public.interviews (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid references public.applications(id) on delete cascade,
  candidate_id     uuid not null references public.candidates(id) on delete cascade,
  type             text not null default 'ai_voice' check (type in (
    'ai_voice','phone','video','in_person'
  )),
  scheduled_at     timestamptz,
  completed_at     timestamptz,
  duration_seconds int,
  interviewer_id   uuid references public.hr_users(id),
  vapi_call_id     text unique,
  status           text not null default 'scheduled' check (status in (
    'scheduled','in_progress','completed','no_show','cancelled'
  )),
  overall_score    numeric(3,1),
  summary          text,
  created_at       timestamptz default now()
);

alter table public.interviews enable row level security;

create policy "hr_all_interviews" on public.interviews for all to authenticated using (true) with check (true);

-- ────────────────────────────────────────────────────────────
-- 7. INTERVIEW TRANSCRIPTS
-- ────────────────────────────────────────────────────────────
create table if not exists public.interview_transcripts (
  id                  uuid primary key default gen_random_uuid(),
  interview_id        uuid not null references public.interviews(id) on delete cascade,
  transcript          jsonb,
  ai_summary          text,
  sentiment_score     numeric(3,2),
  keywords_detected   text[] default '{}',
  questions_asked     jsonb,
  answers_scored      jsonb,
  recommendation      text check (recommendation in ('proceed','reject','hold')),
  raw_vapi_payload    jsonb,
  created_at          timestamptz default now()
);

alter table public.interview_transcripts enable row level security;

create policy "hr_all_transcripts" on public.interview_transcripts for all to authenticated using (true) with check (true);

-- ────────────────────────────────────────────────────────────
-- 8. NOTES
-- ────────────────────────────────────────────────────────────
create table if not exists public.notes (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  application_id uuid references public.applications(id),
  author_id      uuid references public.hr_users(id),
  content        text not null,
  note_type      text not null default 'general' check (note_type in (
    'general','interview_feedback','offer_note'
  )),
  created_at     timestamptz default now()
);

alter table public.notes enable row level security;

create policy "hr_all_notes" on public.notes for all to authenticated using (true) with check (true);

-- Keep notes_count in sync
create or replace function public.update_notes_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.candidates set notes_count = notes_count + 1, last_activity_at = now()
    where id = new.candidate_id;
  elsif tg_op = 'DELETE' then
    update public.candidates set notes_count = greatest(notes_count - 1, 0)
    where id = old.candidate_id;
  end if;
  return null;
end;
$$;

create trigger trg_notes_count
  after insert or delete on public.notes
  for each row execute function public.update_notes_count();

-- ────────────────────────────────────────────────────────────
-- 9. TAGS
-- ────────────────────────────────────────────────────────────
create table if not exists public.tags (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  color    text not null default '#6366f1',
  category text not null default 'skill' check (category in (
    'skill','seniority','flag','source'
  ))
);

create table if not exists public.candidate_tags (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  tag_id       uuid not null references public.tags(id) on delete cascade,
  primary key (candidate_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.candidate_tags enable row level security;

create policy "hr_read_tags"  on public.tags for select to authenticated using (true);
create policy "admin_write_tags" on public.tags for all to authenticated using (true) with check (true);
create policy "hr_all_candidate_tags" on public.candidate_tags for all to authenticated using (true) with check (true);

-- Seed common tags
insert into public.tags (name, color, category) values
  ('Finance',      '#f59e0b', 'skill'),
  ('Technology',   '#6366f1', 'skill'),
  ('HR',           '#ec4899', 'skill'),
  ('Operations',   '#14b8a6', 'skill'),
  ('Sales',        '#f97316', 'skill'),
  ('Executive',    '#1d4ed8', 'seniority'),
  ('Senior',       '#7c3aed', 'seniority'),
  ('Mid-Level',    '#059669', 'seniority'),
  ('Junior',       '#94a3b8', 'seniority'),
  ('Urgent',       '#ef4444', 'flag'),
  ('Do Not Contact','#78716c','flag'),
  ('Referred',     '#d97706', 'source'),
  ('LinkedIn',     '#0077b5', 'source')
on conflict (name) do nothing;

-- ────────────────────────────────────────────────────────────
-- 10. EMAIL TEMPLATES
-- ────────────────────────────────────────────────────────────
create table if not exists public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subject    text not null,
  body_html  text not null,
  type       text not null check (type in (
    'invite_interview','rejection','offer','follow_up','shortlist_notification'
  )),
  created_at timestamptz default now()
);

alter table public.email_templates enable row level security;

create policy "hr_read_templates"  on public.email_templates for select to authenticated using (true);
create policy "admin_write_templates" on public.email_templates for all to authenticated
  using ( (select role from public.hr_users where id = auth.uid()) in ('admin','recruiter') )
  with check ( (select role from public.hr_users where id = auth.uid()) in ('admin','recruiter') );

-- Seed default templates
insert into public.email_templates (name, subject, body_html, type) values
  (
    'AI Interview Invitation',
    'Your screening interview with Assorted Staffing',
    '<p>Dear {{first_name}},</p><p>Thank you for your interest in the <strong>{{role}}</strong> position. We would like to invite you to a brief AI-assisted screening call.</p><p>Our system will call you at <strong>{{phone}}</strong> within the next 24 hours. The call takes approximately 10–15 minutes.</p><p>Best regards,<br>Assorted Staffing Team</p>',
    'invite_interview'
  ),
  (
    'Application Received',
    'We received your application — Assorted Staffing',
    '<p>Dear {{first_name}},</p><p>Thank you for applying to Assorted Staffing. We have received your CV and will review it shortly.</p><p>We will be in touch within 5 business days.</p><p>Best regards,<br>Assorted Staffing Team</p>',
    'follow_up'
  ),
  (
    'Shortlist Notification',
    'Great news — you have been shortlisted',
    '<p>Dear {{first_name}},</p><p>We are pleased to inform you that your application for <strong>{{role}}</strong> has been shortlisted. A member of our team will be in contact shortly to discuss next steps.</p><p>Best regards,<br>Assorted Staffing Team</p>',
    'shortlist_notification'
  ),
  (
    'Rejection — Thank You',
    'Your application with Assorted Staffing',
    '<p>Dear {{first_name}},</p><p>Thank you for taking the time to apply and speak with us. After careful consideration, we will not be moving forward with your application at this time.</p><p>We will keep your details on file and reach out if a suitable opportunity arises.</p><p>Best regards,<br>Assorted Staffing Team</p>',
    'rejection'
  )
on conflict do nothing;

-- ────────────────────────────────────────────────────────────
-- 11. HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────

-- Function: advance a candidate to next pipeline stage
create or replace function public.advance_candidate_stage(
  p_candidate_id uuid,
  p_current_stage_id uuid
)
returns uuid language plpgsql security definer as $$
declare
  v_next_stage_id uuid;
begin
  select id into v_next_stage_id
  from public.pipeline_stages
  where order_index = (
    select order_index + 1 from public.pipeline_stages where id = p_current_stage_id
  )
  limit 1;

  if v_next_stage_id is not null then
    update public.candidates
    set stage_id = v_next_stage_id, last_activity_at = now()
    where id = p_candidate_id;

    update public.applications
    set stage_id = v_next_stage_id
    where candidate_id = p_candidate_id and status = 'active';
  end if;

  return v_next_stage_id;
end;
$$;

-- Function: get pipeline summary counts per stage
create or replace function public.pipeline_summary()
returns table (
  stage_id    uuid,
  stage_name  text,
  stage_type  text,
  color       text,
  order_index int,
  count       bigint
) language sql security definer as $$
  select
    ps.id,
    ps.name,
    ps.stage_type,
    ps.color,
    ps.order_index,
    count(c.id)
  from public.pipeline_stages ps
  left join public.candidates c on c.stage_id = ps.id
  group by ps.id, ps.name, ps.stage_type, ps.color, ps.order_index
  order by ps.order_index;
$$;

-- ────────────────────────────────────────────────────────────
-- 12. INDEXES for performance
-- ────────────────────────────────────────────────────────────
create index if not exists idx_candidates_stage      on public.candidates(stage_id);
create index if not exists idx_candidates_assigned   on public.candidates(assigned_to);
create index if not exists idx_candidates_status     on public.candidates(status);
create index if not exists idx_candidates_created    on public.candidates(created_at desc);
create index if not exists idx_applications_candidate on public.applications(candidate_id);
create index if not exists idx_applications_job      on public.applications(job_id);
create index if not exists idx_interviews_candidate  on public.interviews(candidate_id);
create index if not exists idx_interviews_vapi       on public.interviews(vapi_call_id);
create index if not exists idx_notes_candidate       on public.notes(candidate_id);
