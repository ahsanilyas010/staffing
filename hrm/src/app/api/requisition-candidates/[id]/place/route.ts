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

  const { start_date, bill_rate_pkr, pay_rate_pkr } = await request.json()

  const { data: rc } = await supabase
    .from('requisition_candidates')
    .select('id, candidate_id, requisition_id')
    .eq('id', params.id)
    .single()

  if (!rc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const guaranteeUntil = new Date(start_date)
  guaranteeUntil.setDate(guaranteeUntil.getDate() + 30)

  const { data: placement, error } = await supabase
    .from('placements')
    .insert({
      candidate_id: rc.candidate_id,
      requisition_id: rc.requisition_id,
      start_date,
      bill_rate_pkr,
      pay_rate_pkr,
      guarantee_until: guaranteeUntil.toISOString().slice(0, 10),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabase.from('requisition_candidates').update({ status: 'placed' }).eq('id', params.id)
  await supabase.from('candidates').update({ bench: false }).eq('id', rc.candidate_id)

  const { data: requisition } = await supabase.from('requisitions').select('headcount, id').eq('id', rc.requisition_id).single()
  const { count: placedCount } = await supabase
    .from('placements')
    .select('id', { count: 'exact', head: true })
    .eq('requisition_id', rc.requisition_id)
    .eq('status', 'active')

  if (requisition && (placedCount ?? 0) >= requisition.headcount) {
    await supabase.from('requisitions').update({ status: 'filled' }).eq('id', requisition.id)
  }

  await logActivity(supabase, {
    entityType: 'placement',
    entityId: placement.id,
    actor: session.user.id,
    action: 'placement_created',
    reason: `Placed candidate ${rc.candidate_id} on requisition ${rc.requisition_id}`,
  })

  return NextResponse.json({ placement })
}
