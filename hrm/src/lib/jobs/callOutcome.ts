import { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity'

// Vapi endedReason values that mean the candidate never actually talked to the assistant.
const NO_ANSWER_REASONS = new Set([
  'customer-did-not-answer',
  'customer-busy',
  'voicemail',
  'no-answer',
  'phone-call-provider-closed-websocket',
  'assistant-said-nothing',
])

const MAX_ATTEMPTS = 3

function pktDate(hour: number, addDays = 0): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + addDays)
  d.setUTCHours(hour - 5, 0, 0, 0) // PKT is UTC+5
  return d
}

export function isNoAnswer(endedReason: string | undefined): boolean {
  return !!endedReason && NO_ANSWER_REASONS.has(endedReason)
}

export async function handleNoAnswer(
  supabase: SupabaseClient,
  params: { application_id: string; candidate_id: string; interview_id: string; attempt_no: number }
) {
  await supabase
    .from('interviews')
    .update({ status: 'no_show' })
    .eq('id', params.interview_id)

  if (params.attempt_no >= MAX_ATTEMPTS) {
    // Exhausted retries: stop calling, start the SMS/WhatsApp drip with a self-schedule link
    await supabase
      .from('applications')
      .update({ next_call_at: null })
      .eq('id', params.application_id)

    await startDrip(supabase, params.application_id, params.candidate_id)

    await logActivity(supabase, {
      entityType: 'application',
      entityId: params.application_id,
      action: 'screening_call_exhausted',
      reason: `${MAX_ATTEMPTS} unanswered call attempts — switched to messaging drip`,
    })
    return
  }

  // Retry schedule: attempt 1 -> +2h, attempt 2 -> next calling-hours day at 10:00 PKT
  const nextCallAt = params.attempt_no === 1 ? new Date(Date.now() + 2 * 60 * 60 * 1000) : pktDate(10, 1)

  await supabase
    .from('applications')
    .update({ next_call_at: nextCallAt.toISOString() })
    .eq('id', params.application_id)

  await logActivity(supabase, {
    entityType: 'application',
    entityId: params.application_id,
    action: 'screening_call_no_answer',
    reason: `Attempt ${params.attempt_no} unanswered, retry scheduled for ${nextCallAt.toISOString()}`,
  })
}

export async function startDrip(supabase: SupabaseClient, applicationId: string, candidateId: string) {
  const { data: application } = await supabase
    .from('applications')
    .select('id, job_id, jobs(title)')
    .eq('id', applicationId)
    .single()

  const roleTitle = (application as any)?.jobs?.title ?? 'the role'

  // 5-step drip over 4 days: call, SMS, call, WhatsApp, final SMS
  // Calls are re-queued via next_call_at; messages go through outbound_messages.
  const steps: { offsetHours: number; channel: 'sms' | 'whatsapp'; templateKey: string }[] = [
    { offsetHours: 0, channel: 'sms', templateKey: 'callMissed' },
    { offsetHours: 24, channel: 'whatsapp', templateKey: 'callMissed' },
    { offsetHours: 96, channel: 'sms', templateKey: 'callMissed' },
  ]

  for (const step of steps) {
    await supabase.from('outbound_messages').insert({
      candidate_id: candidateId,
      application_id: applicationId,
      channel: step.channel,
      template_key: step.templateKey,
      payload: { role: roleTitle, link: `${process.env.APP_BASE_URL}/schedule/${applicationId}` },
      scheduled_for: new Date(Date.now() + step.offsetHours * 60 * 60 * 1000).toISOString(),
    })
  }
}
