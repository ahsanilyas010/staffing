-- ============================================================
-- Remove QA test submissions made through the website form.
-- 1) Run the SELECT, check that ONLY test rows are listed.
-- 2) Uncomment and run the DELETE block.
-- 3) CV files: delete them in Dashboard → Storage → cvs. Deleting
--    storage.objects rows via SQL leaves the actual files orphaned.
--    QA files from 2026-09-25:
--      1790286541944_f5bdb37a7e5c432fb1e3a7e5de2bf903.pdf  (linked to test candidate)
--      1790286546317_a2ae90917f704efc806d2095ca3ebf4d.pdf  (rejected duplicate, orphan)
-- ============================================================

select c.id, c.created_at, c.first_name, c.last_name, c.email, c.status, c.source,
       s.name as stage, c.cv_file_path,
       (select count(*) from public.applications a where a.candidate_id = c.id) as applications
from public.candidates c
left join public.pipeline_stages s on s.id = c.stage_id
where c.email like 'qa.test+%@assorted.group'
order by c.created_at desc;

-- Hire Talent popup test leads
select id, created_at, contact_name, company_name, email, hiring_type, source_cta, status
from public.client_requirements
where email like 'qa.test+%@assorted.group'
order by created_at desc;

-- begin;
-- delete from public.candidates             -- applications, notes, interviews cascade
-- where email like 'qa.test+%@assorted.group';
-- delete from public.client_requirements
-- where email like 'qa.test+%@assorted.group';
-- commit;
