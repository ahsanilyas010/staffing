-- ============================================================
-- Phase 3: Interview Scheduling
-- interview_slots, self-schedule tokens, kiosk check-in support
-- Idempotent — safe to re-run
-- ============================================================

create table if not exists public.interview_slots (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid references public.entities(id),
  location       text not null default 'Assorted CoWorking, above D. Watson, D-12 Markaz, Islamabad',
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  capacity       int not null default 2,
  booked         int not null default 0,
  interviewer_id uuid references public.hr_users(id),
  blocked        boolean not null default false,
  created_at     timestamptz default now()
);

alter table public.interview_slots enable row level security;
create policy "hr_read_slots" on public.interview_slots for select to authenticated using (is_hr_user());
create policy "hr_write_slots" on public.interview_slots for all to authenticated
  using (hr_can_write()) with check (hr_can_write());

-- Public/anon needs to read open slots to self-schedule
create policy "anon_read_open_slots" on public.interview_slots for select to anon
  using (blocked = false and booked < capacity);

create index if not exists interview_slots_starts_at on public.interview_slots(starts_at);

-- Generate default slots: 15-min slots, 13:00-17:00 PKT, Mon-Sat, capacity 2, next 14 days
do $$
declare
  d date;
  slot_start timestamptz;
  e_id uuid;
begin
  select id into e_id from public.entities where slug = 'staffing';
  for d in select generate_series(current_date, current_date + interval '14 days', interval '1 day')::date loop
    if extract(dow from d) != 0 then -- skip Sunday
      for h in 13..16 loop
        for m in array[0,15,30,45] loop
          slot_start := (d::text || ' ' || h || ':' || m || ':00')::timestamp at time zone 'Asia/Karachi';
          insert into public.interview_slots (entity_id, starts_at, ends_at, capacity)
          values (e_id, slot_start, slot_start + interval '15 minutes', 2)
          on conflict do nothing;
        end loop;
      end loop;
    end if;
  end loop;
end $$;

-- Trigger to keep booked count in sync when interviews reference a slot
alter table public.interviews
  add column if not exists slot_id uuid references public.interview_slots(id);

create or replace function public.sync_slot_booked_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' and new.slot_id is not null then
    update public.interview_slots set booked = booked + 1 where id = new.slot_id;
  elsif TG_OP = 'DELETE' and old.slot_id is not null then
    update public.interview_slots set booked = greatest(booked - 1, 0) where id = old.slot_id;
  elsif TG_OP = 'UPDATE' and old.slot_id is distinct from new.slot_id then
    if old.slot_id is not null then
      update public.interview_slots set booked = greatest(booked - 1, 0) where id = old.slot_id;
    end if;
    if new.slot_id is not null then
      update public.interview_slots set booked = booked + 1 where id = new.slot_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_slot_booked on public.interviews;
create trigger trg_sync_slot_booked
  after insert or update or delete on public.interviews
  for each row execute function public.sync_slot_booked_count();
