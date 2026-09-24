-- ============================================================
-- 001 — Read-only: what runs when someone signs up?
-- Shows triggers on auth.users and the body of handle_new_user.
-- ============================================================

select 'trigger' as kind,
       t.tgname as name,
       p.proname as function_name,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal

union all
select 'function', 'handle_new_user', 'public.handle_new_user',
       pg_get_functiondef('public.handle_new_user'::regproc)

union all
select 'hr_user', u.email, h.role,
       'auth created ' || u.created_at::text || ' | confirmed ' || coalesce(u.email_confirmed_at::text, 'NO')
         || ' | last sign-in ' || coalesce(u.last_sign_in_at::text, 'never')
from public.hr_users h
join auth.users u on u.id = h.id

union all
select 'auth_users_total', count(*)::text, '', ''
from auth.users;
