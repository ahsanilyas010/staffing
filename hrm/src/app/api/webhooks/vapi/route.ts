import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyWebhookSignature } from '@/lib/providers/voice'
import { logActivity } from '@/lib/activity'
import { isNoAnswer, handleNoAnswer } from '@/lib/jobs/callOutcome'

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const signature = request.headers.get('x-vapi-signature') ?? ''

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(raw)
  const supabase = createServiceClient()
  const message = event.message

  if (message?.type === 'end-of-call-report') {
    const callId = message.call?.id
    const { data: interview } = await supabase
      .from('interviews')
      .select('id, application_id, candidate_id')
      .eq('vapi_call_id', callId)
      .single()

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found for call' }, { status: 404 })
    }

    if (isNoAnswer(message.endedReason)) {
      const { data: interviewRow } = await supabase
        .from('interviews')
        .select('attempt_no')
        .eq('id', interview.id)
        .single()

      await handleNoAnswer(supabase, {
        application_id: interview.application_id,
        candidate_id: interview.candidate_id,
        interview_id: interview.id,
        attempt_no: interviewRow?.attempt_no ?? 1,
      })

      return NextResponse.json({ ok: true, outcome: 'no_answer' })
    }

    await supabase
      .from('interviews')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_seconds: message.durationSeconds ?? null,
        recording_url: message.recordingUrl ?? message.artifact?.recordingUrl ?? null,
        cost_usd: message.cost ?? null,
        summary: message.summary ?? message.analysis?.summary ?? null,
      })
      .eq('id', interview.id)

    await supabase.from('interview_transcripts').insert({
      interview_id: interview.id,
      transcript: message.transcript ?? message.artifact?.transcript ?? {},
      ai_summary: message.summary ?? message.analysis?.summary ?? null,
      raw_vapi_payload: message,
    })

    await logActivity(supabase, {
      entityType: 'interview',
      entityId: interview.id,
      action: 'call_completed',
      reason: `Vapi call ${callId} ended`,
    })

    await supabase.from('jobs_queue').insert({
      job_type: 'screening.score',
      payload: { interview_id: interview.id, application_id: interview.application_id },
    })
  }

  return NextResponse.json({ ok: true })
}
