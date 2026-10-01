-- ============================================================
-- Phase 5: Staff Augmentation
-- clients, client_users, requisitions, placements, timesheets
-- Idempotent — safe to re-run
-- ============================================================

create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  contacts       jsonb default '[]',
  payroll_model  text not null default 'assorted_payroll' check (payroll_model in ('assorted_payroll','client_payroll')),
  markup_pct     numeric,
  fixed_fee_pkr  numeric,
  billing_terms  text,
  created_at     timestamptz default now()
);

alter table public.clients enable row level security;
create policy "hr_all_clients" on public.clients for all to authenticated
  using (is_hr_user()) with check (hr_can_write());

-- Now that clients exists, wire up the FK left nullable in migration 003
alter table public.jobs
  add constraint jobs_client_id_fkey foreign key (client_id) references public.clients(id)
  on delete set null;

create table if not exists public.client_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  full_name     text,
  email         text,
  created_at    timestamptz default now(),
  unique (auth_user_id, client_id)
);

alter table public.client_users enable row level security;

create or replace function public.is_client_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.client_users where auth_user_id = auth.uid());
$$;

create or replace function public.client_id_for_current_user() returns uuid
  language sql stable security definer set search_path = public as $$
  select client_id from public.client_users where auth_user_id = auth.uid() limit 1;
$$;

create policy "hr_all_client_users" on public.client_users for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "client_read_own" on public.client_users for select to authenticated
  using (auth_user_id = auth.uid());

create table if not exists public.requisitions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  job_id       uuid references public.jobs(id),
  headcount    int not null default 1,
  location     text,
  start_date   date,
  budget_pkr   numeric,
  status       text not null default 'open' check (status in ('open','filled','cancelled','on_hold')),
  created_by   uuid references public.hr_users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.requisitions enable row level security;
create policy "hr_all_requisitions" on public.requisitions for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "client_read_own_requisitions" on public.requisitions for select to authenticated
  using (is_client_user() and client_id = client_id_for_current_user());

create table if not exists public.placements (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates(id),
  requisition_id    uuid not null references public.requisitions(id),
  start_date        date not null,
  end_date          date,
  bill_rate_pkr     numeric,
  pay_rate_pkr      numeric,
  status            text not null default 'active' check (status in ('active','ended','terminated')),
  guarantee_until   date,
  created_at        timestamptz default now()
);

alter table public.placements enable row level security;
create policy "hr_all_placements" on public.placements for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "client_read_own_placements" on public.placements for select to authenticated
  using (
    is_client_user() and requisition_id in (
      select id from public.requisitions where client_id = client_id_for_current_user()
    )
  );

create table if not exists public.timesheets (
  id            uuid primary key default gen_random_uuid(),
  placement_id  uuid not null references public.placements(id) on delete cascade,
  week_start    date not null,
  hours         numeric not null default 0,
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approved_by   uuid,
  status        text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  token         uuid not null default gen_random_uuid() unique,
  created_at    timestamptz default now(),
  unique (placement_id, week_start)
);

alter table public.timesheets enable row level security;
create policy "hr_all_timesheets" on public.timesheets for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "client_read_own_timesheets" on public.timesheets for select to authenticated
  using (
    is_client_user() and placement_id in (
      select p.id from public.placements p
      join public.requisitions r on r.id = p.requisition_id
      where r.client_id = client_id_for_current_user()
    )
  );
create policy "client_approve_own_timesheets" on public.timesheets for update to authenticated
  using (
    is_client_user() and placement_id in (
      select p.id from public.placements p
      join public.requisitions r on r.id = p.requisition_id
      where r.client_id = client_id_for_current_user()
    )
  );
create policy "service_all_timesheets" on public.timesheets for all using (true) with check (true);

-- Bench flag: auto-set true when AI recommends shortlist but no open job matched
-- (application-level logic sets this; this index supports the /bench search)
create index if not exists candidates_bench on public.candidates(bench) where bench = true;

-- Client leads: public.client_requirements already exists (migration 005,
-- fed by the website's "Hire Talent" popup) with its own RLS. Just add the
-- link to the client record it gets converted into.
alter table public.client_requirements
  add column if not exists converted_client_id uuid references public.clients(id);

-- Candidates submitted to a client against a requisition, before a placement is confirmed
create table if not exists public.requisition_candidates (
  id              uuid primary key default gen_random_uuid(),
  requisition_id  uuid not null references public.requisitions(id) on delete cascade,
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  similarity      numeric,
  status          text not null default 'submitted' check (status in ('submitted','client_approved','client_rejected','interview_requested','placed')),
  submitted_at    timestamptz default now(),
  responded_at    timestamptz,
  unique (requisition_id, candidate_id)
);

alter table public.requisition_candidates enable row level security;
create policy "hr_all_requisition_candidates" on public.requisition_candidates for all to authenticated
  using (is_hr_user()) with check (hr_can_write());
create policy "client_read_own_requisition_candidates" on public.requisition_candidates for select to authenticated
  using (
    is_client_user() and requisition_id in (
      select id from public.requisitions where client_id = client_id_for_current_user()
    )
  );
create policy "client_respond_requisition_candidates" on public.requisition_candidates for update to authenticated
  using (
    is_client_user() and requisition_id in (
      select id from public.requisitions where client_id = client_id_for_current_user()
    )
  );

-- Client-safe candidate view: name, summary, scores — no phone/email/CV path
create or replace view public.client_candidate_view
with (security_invoker = true) as
select
  c.id,
  c.first_name,
  c.last_name,
  c.preferred_role,
  c.experience_years,
  c.skills,
  c.country
from public.candidates c;

grant select on public.client_candidate_view to authenticated;
