import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  const { phone } = await request.json()
  const supabase = createServiceClient()

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, first_name, last_name')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!candidate) {
    return NextResponse.json({ error: 'No candidate found with that phone number' }, { status: 404 })
  }

  const windowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const windowEnd = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  const { data: interview } = await supabase
    .from('interviews')
    .select('id, scheduled_at, status')
    .eq('candidate_id', candidate.id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .order('scheduled_at')
    .limit(1)
    .single()

  if (!interview) {
    return NextResponse.json({ error: 'No interview found around this time — please see the front desk' }, { status: 404 })
  }

  await supabase
    .from('interviews')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', interview.id)

  await logActivity(supabase, {
    entityType: 'interview',
    entityId: interview.id,
    action: 'checked_in',
    reason: 'Kiosk self check-in',
  })

  return NextResponse.json({ name: `${candidate.first_name} ${candidate.last_name}`, scheduled_at: interview.scheduled_at })
}
