-- ============================================================
-- Phase 5 continued: semantic bench search RPC
-- Idempotent — safe to re-run
-- ============================================================

create or replace function public.match_candidates(
  query_embedding vector(1536),
  match_count int default 20,
  only_bench boolean default true
)
returns table (
  candidate_id uuid,
  similarity numeric
)
language sql stable security definer set search_path = public as $$
  select
    ce.candidate_id,
    (1 - (ce.embedding <=> query_embedding))::numeric as similarity
  from public.candidate_embeddings ce
  join public.candidates c on c.id = ce.candidate_id
  where (not only_bench or c.bench = true)
    and c.do_not_contact = false
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_candidates(vector, int, boolean) to authenticated;
