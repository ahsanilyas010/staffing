import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { embed } from '@/lib/providers/embeddings'

export async function POST(request: NextRequest) {
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

  const { query, city, salaryMaxPkr } = await request.json()

  let candidateIds: string[] | null = null
  let similarityById = new Map<string, number>()

  if (query?.trim()) {
    const vector = await embed(query)
    const { data: matches, error } = await supabase.rpc('match_candidates', {
      query_embedding: vector,
      match_count: 50,
      only_bench: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    candidateIds = (matches ?? []).map((m: any) => m.candidate_id)
    similarityById = new Map((matches ?? []).map((m: any) => [m.candidate_id, m.similarity]))
  }

  let dbQuery = supabase
    .from('candidates')
    .select('id, first_name, last_name, email, phone, country, preferred_role, experience_years, salary_expectation, skills, bench')
    .eq('bench', true)

  if (candidateIds) {
    dbQuery = dbQuery.in('id', candidateIds)
  }
  if (city) {
    dbQuery = dbQuery.ilike('country', `%${city}%`)
  }

  const { data: candidates, error: fetchError } = await dbQuery.limit(50)
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 })

  let results = candidates ?? []

  if (salaryMaxPkr) {
    results = results.filter((c) => {
      const exp = parseFloat(c.salary_expectation ?? '')
      return isNaN(exp) || exp <= salaryMaxPkr
    })
  }

  if (candidateIds) {
    results = results
      .map((c) => ({ ...c, similarity: similarityById.get(c.id) ?? 0 }))
      .sort((a, b) => b.similarity - a.similarity)
  }

  return NextResponse.json({ results })
}
