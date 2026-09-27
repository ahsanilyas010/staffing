import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logActivity } from '@/lib/activity'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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

  const { candidate_ids } = await request.json() as { candidate_ids: { id: string; similarity?: number }[] }

  const rows = candidate_ids.map((c) => ({
    requisition_id: params.id,
    candidate_id: c.id,
    similarity: c.similarity ?? null,
  }))

  const { error } = await supabase.from('requisition_candidates').upsert(rows, { onConflict: 'requisition_id,candidate_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logActivity(supabase, {
    entityType: 'requisition',
    entityId: params.id,
    actor: session.user.id,
    action: 'shortlist_submitted_to_client',
    reason: `${rows.length} candidates submitted`,
  })

  return NextResponse.json({ ok: true, submitted: rows.length })
}
