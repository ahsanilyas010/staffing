-- ============================================================
-- Assorted Staffing — Migration 006
-- Internal HR notes on client requirements (HRM detail page).
--
-- Run AFTER 005. Paste and run the WHOLE file at once. Safe to re-run.
-- ============================================================

begin;

create table if not exists public.client_requirement_notes (
  id              uuid        primary key default gen_random_uuid(),
  requirement_id  uuid        not null references public.client_requirements(id) on delete cascade,
  author_id       uuid        default auth.uid() references public.hr_users(id) on delete set null,
  content         text        not null check (char_length(btrim(content)) between 1 and 5000),
  created_at      timestamptz not null default now()
);

create index if not exists idx_client_requirement_notes_req
  on public.client_requirement_notes (requirement_id, created_at desc);

-- A new note counts as activity on the lead
create or replace function public.client_requirement_notes_touch()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.client_requirements set updated_at = now() where id = new.requirement_id;
  return null;
end;
$$;

drop trigger if exists trg_client_requirement_notes_touch on public.client_requirement_notes;
create trigger trg_client_requirement_notes_touch
  after insert on public.client_requirement_notes
  for each row execute function public.client_requirement_notes_touch();

revoke execute on function public.client_requirement_notes_touch() from public, anon, authenticated;

-- RLS: HR reads; non-viewers add notes (always as themselves); admins delete
alter table public.client_requirement_notes enable row level security;

do $$
declare
  r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'client_requirement_notes'
  loop
    execute format('drop policy if exists %I on public.client_requirement_notes', r.policyname);
  end loop;
end $$;

create policy "hr_read_requirement_notes" on public.client_requirement_notes
  for select to authenticated using (public.is_hr_user());
create policy "hr_insert_requirement_notes" on public.client_requirement_notes
  for insert to authenticated
  with check (public.hr_can_write() and author_id = auth.uid());
create policy "admin_delete_requirement_notes" on public.client_requirement_notes
  for delete to authenticated using (public.is_hr_admin());

revoke all on public.client_requirement_notes from anon;
grant select, insert, delete on public.client_requirement_notes to authenticated;

commit;
