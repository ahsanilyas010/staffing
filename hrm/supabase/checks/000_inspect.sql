-- ============================================================
-- 000 — Read-only inspection (safe to run any time)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Returns ONE result set so the whole output can be copied.
-- ============================================================

select 'policy' as kind,
       schemaname || '.' || tablename as object,
       policyname as name,
       cmd || ' to ' || array_to_string(roles, ',') as detail,
       coalesce(qual, '') || case when with_check is not null then ' | check: ' || with_check else '' end as definition
from pg_policies
where schemaname = 'public'
   or (schemaname = 'storage' and tablename = 'objects')

union all
select 'trigger', 'public.' || c.relname, t.tgname, p.proname, ''
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal

union all
select 'constraint', 'public.' || conrelid::regclass::text, conname, contype::text, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.candidates'::regclass

union all
select 'bucket', 'storage.buckets', id,
       'public=' || public::text,
       'size_limit=' || coalesce(file_size_limit::text, 'none') || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), 'any')
from storage.buckets

union all
select 'function', 'public.' || p.proname,
       case when p.prosecdef then 'security definer' else 'security invoker' end,
       coalesce(array_to_string(p.proacl::text[], ' '), 'default acl'), ''
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

union all
select 'role', rolname, 'bypassrls=' || rolbypassrls::text, 'superuser=' || rolsuper::text, ''
from pg_roles
where rolname in ('postgres', 'anon', 'authenticated')

union all
select 'setting', 'auth', 'role seen by SQL editor', coalesce(auth.role(), 'null'), ''

union all
select 'count', 'hr_users', 'total', (select count(*) from public.hr_users)::text,
       coalesce((select string_agg(email || ' (' || role || ')', ', ') from public.hr_users), '')

union all
select 'count', 'candidates', 'total', (select count(*) from public.candidates)::text, ''

union all
select 'count', 'candidates', 'stage_id is null',
       (select count(*) from public.candidates where stage_id is null)::text, ''

union all
select 'count', 'candidates', 'without application row',
       (select count(*) from public.candidates c
         where not exists (select 1 from public.applications a where a.candidate_id = c.id))::text, ''

union all
select 'count', 'candidates', 'created in last 7 days',
       (select count(*) from public.candidates where created_at > now() - interval '7 days')::text, ''

order by 1, 2, 3;
