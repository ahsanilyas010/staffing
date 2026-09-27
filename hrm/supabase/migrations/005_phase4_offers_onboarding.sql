-- ============================================================
-- Phase 4: Offers and Onboarding
-- Idempotent — safe to re-run
-- ============================================================

create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  salary_pkr     numeric not null,
  start_date     date,
  probation_days int default 90,
  pdf_url        text,
  token          uuid not null default gen_random_uuid() unique,
  status         text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired')),
  sent_at        timestamptz,
  expires_at     timestamptz,
  responded_at   timestamptz,
  response       text check (response in ('accepted','declined')),
  created_by     uuid references public.hr_users(id),
  created_at     timestamptz default now()
);

alter table public.offers enable row level security;
create policy "hr_all_offers" on public.offers for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "service_all_offers" on public.offers for all using (true) with check (true);

create index if not exists offers_token on public.offers(token);

create table if not exists public.onboarding_items (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  item_key       text not null,
  label          text not null,
  required       boolean not null default true,
  status         text not null default 'pending' check (status in ('pending','submitted','approved','rejected')),
  file_url       text,
  completed_at   timestamptz,
  created_at     timestamptz default now()
);

alter table public.onboarding_items enable row level security;
create policy "hr_all_onboarding_items" on public.onboarding_items for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "service_all_onboarding_items" on public.onboarding_items for all using (true) with check (true);

create table if not exists public.employees (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates(id),
  entity_id      uuid references public.entities(id),
  job_id         uuid references public.jobs(id),
  application_id uuid references public.applications(id),
  joining_date   date not null,
  probation_end  date,
  status         text not null default 'active' check (status in ('active','on_probation','terminated','resigned')),
  created_at     timestamptz default now()
);

alter table public.employees enable row level security;
create policy "hr_all_employees" on public.employees for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "service_all_employees" on public.employees for all using (true) with check (true);

-- Default onboarding checklist applied to jobs that don't have one set yet
update public.jobs
set onboarding_checklist = '[
  {"key":"cnic_copy","label":"CNIC copy","required":true},
  {"key":"photo","label":"Passport-size photo","required":true},
  {"key":"bank_details","label":"Bank account details","required":true},
  {"key":"emergency_contact","label":"Emergency contact","required":true},
  {"key":"signed_contract","label":"Signed employment contract","required":true},
  {"key":"induction_video","label":"Watch induction video","required":true},
  {"key":"policy_ack","label":"Policy acknowledgement","required":true}
]'::jsonb
where onboarding_checklist = '[]'::jsonb or onboarding_checklist is null;
