import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: timesheet } = await supabase
    .from('timesheets')
    .select('id, week_start, hours, status, placements(candidates(first_name,last_name), requisitions(jobs(title)))')
    .eq('token', params.token)
    .single()

  if (!timesheet) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ timesheet })
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const { hours } = await request.json()
  const supabase = createServiceClient()

  const { data: timesheet, error } = await supabase
    .from('timesheets')
    .update({ hours, status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('token', params.token)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logActivity(supabase, {
    entityType: 'timesheet',
    entityId: timesheet.id,
    action: 'timesheet_submitted',
    reason: `${hours} hours for week of ${timesheet.week_start}`,
  })

  return NextResponse.json({ ok: true })
}
