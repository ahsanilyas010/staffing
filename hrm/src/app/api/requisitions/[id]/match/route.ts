import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { embed } from '@/lib/providers/embeddings'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: requisition } = await supabase
    .from('requisitions')
    .select('id, budget_pkr, jobs(title, must_have_skills, nice_to_have_skills, location)')
    .eq('id', params.id)
    .single()

  if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  const job = (requisition as any).jobs
  const profileText = [
    job?.title ?? '',
    (job?.must_have_skills ?? []).join(', '),
    (job?.nice_to_have_skills ?? []).join(', '),
  ]
    .filter(Boolean)
    .join('. ')

  const vector = await embed(profileText)

  const { data: matches, error } = await supabase.rpc('match_candidates', {
    query_embedding: vector,
    match_count: 20,
    only_bench: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const candidateIds = (matches ?? []).map((m: any) => m.candidate_id)
  if (candidateIds.length === 0) return NextResponse.json({ results: [] })

  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, first_name, last_name, preferred_role, experience_years, salary_expectation, country, skills')
    .in('id', candidateIds)

  const similarityById = new Map((matches ?? []).map((m: any) => [m.candidate_id, m.similarity]))

  const results = (candidates ?? [])
    .map((c) => ({ ...c, similarity: Number(similarityById.get(c.id) ?? 0) }))
    .sort((a, b) => b.similarity - a.similarity)

  return NextResponse.json({ results })
}
