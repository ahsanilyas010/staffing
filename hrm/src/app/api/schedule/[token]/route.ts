import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

// token === application id
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: application } = await supabase
    .from('applications')
    .select('id, status, candidates(first_name, last_name), jobs(title)')
    .eq('id', params.token)
    .single()

  if (!application) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: slots } = await supabase
    .from('interview_slots')
    .select('id, starts_at, ends_at, location, capacity, booked')
    .eq('blocked', false)
    .gt('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(100)

  const available = (slots ?? []).filter((s) => s.booked < s.capacity)

  return NextResponse.json({
    candidate: (application as any).candidates,
    job: (application as any).jobs,
    slots: available,
  })
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()
  const { slot_id } = await request.json()

  const { data: application } = await supabase
    .from('applications')
    .select('id, candidate_id')
    .eq('id', params.token)
    .single()

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const { data: slot } = await supabase
    .from('interview_slots')
    .select('id, starts_at, ends_at, location, booked, capacity')
    .eq('id', slot_id)
    .single()

  if (!slot || slot.booked >= slot.capacity) {
    return NextResponse.json({ error: 'Slot no longer available' }, { status: 409 })
  }

  const { data: interview, error } = await supabase
    .from('interviews')
    .insert({
      application_id: application.id,
      candidate_id: application.candidate_id,
      type: 'in_person',
      slot_id: slot.id,
      scheduled_at: slot.starts_at,
      status: 'scheduled',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('stage_type', 'interview_scheduled')
    .single()

  if (stage) {
    await supabase.from('applications').update({ stage_id: stage.id }).eq('id', application.id)
  }

  await logActivity(supabase, {
    entityType: 'interview',
    entityId: interview.id,
    action: 'self_scheduled',
    reason: `Booked slot ${slot.starts_at}`,
  })

  const startDate = new Date(slot.starts_at)
  const dateStr = startDate.toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' })
  const timeStr = startDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })

  await supabase.from('outbound_messages').insert([
    {
      candidate_id: application.candidate_id,
      application_id: application.id,
      channel: 'whatsapp',
      template_key: 'interviewConfirmed',
      payload: { role: 'your role', date: dateStr, time: timeStr, location: slot.location },
      scheduled_for: new Date().toISOString(),
    },
  ])

  // T-24h and T-2h reminders
  const reminder24 = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
  const reminder2 = new Date(startDate.getTime() - 2 * 60 * 60 * 1000)

  if (reminder24 > new Date()) {
    await supabase.from('outbound_messages').insert({
      candidate_id: application.candidate_id,
      application_id: application.id,
      channel: 'sms',
      template_key: 'interviewReminder24h',
      payload: { role: 'your role', time: timeStr, location: slot.location },
      scheduled_for: reminder24.toISOString(),
    })
  }
  if (reminder2 > new Date()) {
    await supabase.from('outbound_messages').insert({
      candidate_id: application.candidate_id,
      application_id: application.id,
      channel: 'sms',
      template_key: 'interviewReminder2h',
      payload: { role: 'your role', location: slot.location },
      scheduled_for: reminder2.toISOString(),
    })
  }

  return NextResponse.json({ interview_id: interview.id, scheduled_at: slot.starts_at })
}
