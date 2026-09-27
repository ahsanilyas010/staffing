-- ============================================================
-- Phase 1: Hiring Module Foundation
-- Adds entities, extends jobs/applications/interviews,
-- adds 3 pipeline stages, activity_log, application_stage_history,
-- outbound_messages, jobs_queue, candidate_embeddings
-- Idempotent — safe to re-run
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- RLS helpers (idempotent)
-- ────────────────────────────────────────────────────────────
create or replace function public.is_hr_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hr_users where id = auth.uid());
$$;

create or replace function public.hr_can_write() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.hr_users
    where id = auth.uid()
      and role in ('admin','recruiter','hiring_manager')
  );
$$;

create or replace function public.is_hr_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hr_users where id = auth.uid() and role = 'admin');
$$;

-- ────────────────────────────────────────────────────────────
-- ENTITIES (Assorted Group business units)
-- ────────────────────────────────────────────────────────────
create table if not exists public.entities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

alter table public.entities enable row level security;
create policy "hr_read_entities" on public.entities for select to authenticated using (is_hr_user());
create policy "admin_write_entities" on public.entities for all to authenticated
  using (is_hr_admin()) with check (is_hr_admin());

insert into public.entities (slug, name, description) values
  ('abpo',      'Assorted BPO',           'Call center operations — CSR, telesales, QA, team leads'),
  ('apt',       'Assorted Produce Traders','Distribution — order bookers, riders, warehouse, van salesmen'),
  ('abllc',     'Assorted Business LLC',  'Creative agency — designers, developers, media buyers'),
  ('acw',       'Assorted CoWorking',     'Coworking space — reception, community, IT, office support'),
  ('handpicked','HandPicked.pk',          'E-commerce — packers, customer support, social media'),
  ('staffing',  'Assorted Staffing',      'Staff augmentation — placements at client companies')
on conflict (slug) do nothing;

-- ────────────────────────────────────────────────────────────
-- EXTEND pipeline_stages: add 3 new stage types
-- ────────────────────────────────────────────────────────────
alter table public.pipeline_stages
  drop constraint if exists pipeline_stages_stage_type_check;

alter table public.pipeline_stages
  add constraint pipeline_stages_stage_type_check
  check (stage_type in (
    'applied','cv_review','ai_interview','interview_scheduled',
    'hr_interview','technical','final_interview','offer','onboarding',
    'hired','placed','rejected'
  ));

insert into public.pipeline_stages (name, order_index, color, stage_type) values
  ('Interview Scheduled', 4,  '#818cf8', 'interview_scheduled'),
  ('Onboarding',          8,  '#2dd4bf', 'onboarding'),
  ('Placed',              10, '#a3e635', 'placed')
on conflict do nothing;

-- Fix order_index for existing stages that would now collide
update public.pipeline_stages set order_index = order_index + 1
  where order_index >= 4
    and stage_type in ('hr_interview','technical','final_interview','offer','hired','rejected')
    and not exists (
      select 1 from public.pipeline_stages p2
      where p2.stage_type = 'interview_scheduled'
    );

-- ────────────────────────────────────────────────────────────
-- EXTEND jobs table
-- ────────────────────────────────────────────────────────────
alter table public.jobs
  add column if not exists entity_id           uuid references public.entities(id),
  add column if not exists client_id           uuid,  -- FK added in phase 5 when clients table exists
  add column if not exists slug                text unique,
  add column if not exists work_mode           text check (work_mode in ('onsite','remote','hybrid')) default 'onsite',
  add column if not exists shift               text check (shift in ('day','night','rotating')) default 'day',
  add column if not exists must_have_skills    text[] default '{}',
  add column if not exists nice_to_have_skills text[] default '{}',
  add column if not exists screening_questions jsonb default '[]',
  add column if not exists knockout_rules      jsonb default '[]',
  add column if not exists auto_rules          jsonb default '{}',
  add column if not exists interview_scorecard jsonb default '[]',
  add column if not exists onboarding_checklist jsonb default '[]',
  add column if not exists headcount_open      int default 1,
  add column if not exists hiring_manager_id   uuid references public.hr_users(id),
  add column if not exists assessment_url      text;

-- Backfill slugs for existing rows that have none
update public.jobs
  set slug = lower(regexp_replace(title, '[^a-z0-9]+', '-', 'g')) || '-' || substr(id::text,1,8)
  where slug is null;

-- ────────────────────────────────────────────────────────────
-- EXTEND applications table
-- ────────────────────────────────────────────────────────────
alter table public.applications
  add column if not exists fit_score              numeric(4,1),
  add column if not exists communication_score    numeric(4,1),
  add column if not exists cv_score               numeric(4,1),
  add column if not exists salary_expectation_pkr numeric,
  add column if not exists salary_within_band     boolean,
  add column if not exists availability_date      date,
  add column if not exists notice_period_days     int,
  add column if not exists alternate_job_ids      uuid[] default '{}',
  add column if not exists ai_recommendation      text check (ai_recommendation in ('shortlist','reject','hold')),
  add column if not exists human_decision         text check (human_decision in ('shortlist','reject','hold','hire')),
  add column if not exists override_reason        text,
  add column if not exists parent_application_id  uuid references public.applications(id),
  add column if not exists no_show_count          int default 0,
  add column if not exists next_call_at           timestamptz,
  add column if not exists call_attempts          int default 0,
  add column if not exists referral_code          text,
  add column if not exists parsed_cv              jsonb;

create index if not exists applications_job_stage
  on public.applications(job_id, stage_id);

create index if not exists applications_next_call
  on public.applications(next_call_at)
  where status = 'active';

-- ────────────────────────────────────────────────────────────
-- EXTEND interviews table
-- ────────────────────────────────────────────────────────────
alter table public.interviews
  add column if not exists language       text check (language in ('en','ur')) default 'en',
  add column if not exists attempt_no     int default 1,
  add column if not exists recording_url  text,
  add column if not exists cost_usd       numeric(8,4),
  add column if not exists scorecard      jsonb,
  add column if not exists decision       text check (decision in ('pass','fail','hold')),
  add column if not exists checked_in_at  timestamptz,
  add column if not exists meet_link      text;

-- EXTEND interview_transcripts
alter table public.interview_transcripts
  add column if not exists extraction jsonb;

-- EXTEND candidates
alter table public.candidates
  add column if not exists referral_code   text,
  add column if not exists do_not_contact  boolean default false,
  add column if not exists bench           boolean default false,
  add column if not exists parsed_cv       jsonb;

create index if not exists interviews_vapi_call_id
  on public.interviews(vapi_call_id)
  where vapi_call_id is not null;

-- ────────────────────────────────────────────────────────────
-- APPLICATION STAGE HISTORY
-- ────────────────────────────────────────────────────────────
create table if not exists public.application_stage_history (
  id            uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_stage_id  uuid references public.pipeline_stages(id),
  to_stage_id    uuid references public.pipeline_stages(id),
  actor          text not null default 'system',
  reason         text,
  created_at     timestamptz default now()
);

alter table public.application_stage_history enable row level security;
create policy "hr_read_stage_history" on public.application_stage_history
  for select to authenticated using (is_hr_user());
create policy "hr_insert_stage_history" on public.application_stage_history
  for insert to authenticated with check (is_hr_user());

-- Trigger: auto-log stage changes on applications
create or replace function public.log_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.stage_id is distinct from new.stage_id then
    insert into public.application_stage_history
      (application_id, from_stage_id, to_stage_id, actor, reason)
    values (new.id, old.stage_id, new.stage_id, 'system', 'stage updated');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_stage_change on public.applications;
create trigger trg_log_stage_change
  after update on public.applications
  for each row execute function public.log_stage_change();

-- ────────────────────────────────────────────────────────────
-- ACTIVITY LOG
-- ────────────────────────────────────────────────────────────
create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,   -- 'candidate','application','interview','offer','onboarding'
  entity_id    uuid not null,
  actor        text not null,   -- auth.uid() or 'system'
  action       text not null,
  reason       text,
  metadata     jsonb default '{}',
  created_at   timestamptz default now()
);

alter table public.activity_log enable row level security;
create policy "hr_read_activity" on public.activity_log
  for select to authenticated using (is_hr_user());
create policy "hr_insert_activity" on public.activity_log
  for insert to authenticated with check (is_hr_user());

create index if not exists activity_log_entity
  on public.activity_log(entity_type, entity_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- OUTBOUND MESSAGES
-- ────────────────────────────────────────────────────────────
create table if not exists public.outbound_messages (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid references public.candidates(id) on delete cascade,
  application_id uuid references public.applications(id),
  channel       text not null check (channel in ('whatsapp','sms','email')),
  template_key  text not null,
  payload       jsonb default '{}',
  status        text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_id   text,
  error         text,
  scheduled_for timestamptz default now(),
  sent_at       timestamptz,
  created_at    timestamptz default now()
);

alter table public.outbound_messages enable row level security;
create policy "hr_read_messages" on public.outbound_messages
  for select to authenticated using (is_hr_user());
create policy "service_all_messages" on public.outbound_messages
  for all using (true) with check (true);

create index if not exists outbound_messages_dispatch
  on public.outbound_messages(status, scheduled_for)
  where status = 'queued';

-- ────────────────────────────────────────────────────────────
-- JOBS QUEUE (background job runner)
-- ────────────────────────────────────────────────────────────
create table if not exists public.jobs_queue (
  id          uuid primary key default gen_random_uuid(),
  job_type    text not null,
  payload     jsonb default '{}',
  run_at      timestamptz default now(),
  attempts    int default 0,
  max_attempts int default 3,
  status      text not null default 'pending' check (status in ('pending','running','done','failed')),
  error       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.jobs_queue enable row level security;
create policy "service_all_jobs_queue" on public.jobs_queue
  for all using (true) with check (true);

create index if not exists jobs_queue_pending
  on public.jobs_queue(run_at)
  where status = 'pending';

-- ────────────────────────────────────────────────────────────
-- CANDIDATE EMBEDDINGS (pgvector — enable extension first)
-- ────────────────────────────────────────────────────────────
create extension if not exists vector;

create table if not exists public.candidate_embeddings (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.candidates(id) on delete cascade,
  embedding    vector(1536),
  updated_at   timestamptz default now()
);

alter table public.candidate_embeddings enable row level security;
create policy "hr_read_embeddings" on public.candidate_embeddings
  for select to authenticated using (is_hr_user());
create policy "service_write_embeddings" on public.candidate_embeddings
  for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────
-- SEED: job templates for every entity role
-- ────────────────────────────────────────────────────────────
do $$
declare
  e_abpo      uuid; e_apt uuid; e_abllc uuid;
  e_acw       uuid; e_hp  uuid; e_stf   uuid;
begin
  select id into e_abpo  from public.entities where slug = 'abpo';
  select id into e_apt   from public.entities where slug = 'apt';
  select id into e_abllc from public.entities where slug = 'abllc';
  select id into e_acw   from public.entities where slug = 'acw';
  select id into e_hp    from public.entities where slug = 'handpicked';
  select id into e_stf   from public.entities where slug = 'staffing';

  insert into public.jobs (
    title, slug, entity_id, department, location, type, currency,
    work_mode, shift, headcount_open, status,
    must_have_skills, screening_questions, knockout_rules, auto_rules
  ) values
  -- ABPO
  ('Customer Service Representative', 'abpo-csr', e_abpo, 'Operations', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'rotating', 10, 'open',
   array['communication','customer handling','computer basics'],
   '[{"q":"How many years of customer service experience do you have?"},{"q":"Are you comfortable working rotational shifts including nights?"},{"q":"What is your typing speed in words per minute?"}]',
   '[{"field":"available_for_nights","op":"eq","value":false,"action":"reject"}]',
   '{"cv_floor":0,"fit_threshold":60,"salary_cap_pkr":60000}'
  ),
  ('Telesales Agent', 'abpo-telesales', e_abpo, 'Sales', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 15, 'open',
   array['sales','persuasion','communication'],
   '[{"q":"Have you done telesales or telemarketing before?"},{"q":"Describe your best sales achievement."},{"q":"Are you comfortable with a base plus commission structure?"}]',
   '[]',
   '{"cv_floor":0,"fit_threshold":60,"salary_cap_pkr":55000}'
  ),
  ('Team Lead', 'abpo-team-lead', e_abpo, 'Operations', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 3, 'open',
   array['leadership','reporting','conflict resolution','call center'],
   '[{"q":"How many agents have you managed?"},{"q":"How do you handle an underperforming team member?"}]',
   '[]',
   '{"cv_floor":30,"fit_threshold":70,"salary_cap_pkr":90000}'
  ),
  ('QA Analyst', 'abpo-qa', e_abpo, 'Quality', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 2, 'open',
   array['quality assurance','call monitoring','excel'],
   '[{"q":"What QA frameworks or tools have you used?"},{"q":"How do you calibrate scores across evaluators?"}]',
   '[]',
   '{"cv_floor":30,"fit_threshold":70,"salary_cap_pkr":75000}'
  ),
  -- APT
  ('Order Booker', 'apt-order-booker', e_apt, 'Sales', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 5, 'open',
   array['sales','route management','mobile apps'],
   '[{"q":"Do you own a motorbike?"},{"q":"Which areas of Islamabad or Rawalpindi do you know well?"},{"q":"Have you done order booking or FMCG distribution before?"}]',
   '[{"field":"has_motorbike","op":"eq","value":false,"action":"reject"}]',
   '{"cv_floor":0,"fit_threshold":55,"salary_cap_pkr":50000}'
  ),
  ('Delivery Rider', 'apt-delivery-rider', e_apt, 'Logistics', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 8, 'open',
   array['driving','route knowledge','physical fitness'],
   '[{"q":"Do you have a valid driving license?"},{"q":"Do you own a motorbike?"},{"q":"Are you comfortable with daily deliveries across Islamabad?"}]',
   '[{"field":"has_motorbike","op":"eq","value":false,"action":"reject"},{"field":"has_license","op":"eq","value":false,"action":"reject"}]',
   '{"cv_floor":0,"fit_threshold":50,"salary_cap_pkr":40000}'
  ),
  ('Warehouse Helper', 'apt-warehouse-helper', e_apt, 'Logistics', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 4, 'open',
   array['physical work','inventory','reliability'],
   '[{"q":"Have you worked in a warehouse or store before?"},{"q":"Are you comfortable with physical loading and unloading?"}]',
   '[]',
   '{"cv_floor":0,"fit_threshold":50,"salary_cap_pkr":35000}'
  ),
  -- ABLLC
  ('Graphic Designer', 'abllc-designer', e_abllc, 'Creative', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 2, 'open',
   array['adobe photoshop','illustrator','brand design'],
   '[{"q":"What design tools do you use daily?"},{"q":"Share your portfolio link."},{"q":"Describe a brand project you are proud of."}]',
   '[]',
   '{"cv_floor":40,"fit_threshold":72,"salary_cap_pkr":100000}'
  ),
  ('Video Editor', 'abllc-video-editor', e_abllc, 'Creative', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 2, 'open',
   array['premiere pro','after effects','colour grading'],
   '[{"q":"What editing software do you specialize in?"},{"q":"Share a reel or portfolio."},{"q":"What is your fastest turnaround on a 60-second ad?"}]',
   '[]',
   '{"cv_floor":40,"fit_threshold":72,"salary_cap_pkr":100000}'
  ),
  ('Media Buyer', 'abllc-media-buyer', e_abllc, 'Marketing', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 1, 'open',
   array['meta ads','google ads','analytics','budget management'],
   '[{"q":"What monthly ad budget have you managed?"},{"q":"Describe a campaign optimization you are proud of."}]',
   '[]',
   '{"cv_floor":40,"fit_threshold":75,"salary_cap_pkr":120000}'
  ),
  -- ACW
  ('Receptionist', 'acw-receptionist', e_acw, 'Operations', 'D-12 Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 1, 'open',
   array['communication','MS Office','professional appearance'],
   '[{"q":"Do you have front-desk or receptionist experience?"},{"q":"Are you comfortable working 9am to 6pm Monday to Saturday?"}]',
   '[]',
   '{"cv_floor":20,"fit_threshold":65,"salary_cap_pkr":55000}'
  ),
  -- HandPicked
  ('Packer', 'hp-packer', e_hp, 'Operations', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 5, 'open',
   array['physical work','accuracy','reliability'],
   '[{"q":"Have you worked in packing or fulfilment before?"},{"q":"Are you available 6 days a week?"}]',
   '[]',
   '{"cv_floor":0,"fit_threshold":50,"salary_cap_pkr":35000}'
  ),
  ('Customer Support Agent', 'hp-support', e_hp, 'Support', 'Islamabad', 'permanent', 'PKR',
   'onsite', 'day', 2, 'open',
   array['communication','e-commerce knowledge','typing'],
   '[{"q":"Have you handled online store complaints or returns before?"}]',
   '[]',
   '{"cv_floor":0,"fit_threshold":60,"salary_cap_pkr":50000}'
  )
  on conflict (slug) do nothing;
end $$;
