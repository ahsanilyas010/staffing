// Deno Edge Function — receives Vapi call-completion webhooks.
// Verifies HMAC signature, stores transcript, enqueues scoring job.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === signature
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const raw = await req.text()
  const signature = req.headers.get('x-vapi-signature') ?? ''
  const secret = Deno.env.get('VAPI_WEBHOOK_SECRET')!

  if (!(await verifySignature(raw, signature, secret))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const event = JSON.parse(raw)
  const message = event.message

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (message?.type === 'end-of-call-report') {
    const callId = message.call?.id

    const { data: interview } = await supabase
      .from('interviews')
      .select('id, application_id, candidate_id')
      .eq('vapi_call_id', callId)
      .single()

    if (interview) {
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

      await supabase.from('activity_log').insert({
        entity_type: 'interview',
        entity_id: interview.id,
        actor: 'system',
        action: 'call_completed',
        reason: `Vapi call ${callId} ended`,
      })

      await supabase.from('jobs_queue').insert({
        job_type: 'screening.score',
        payload: { interview_id: interview.id, application_id: interview.application_id },
      })
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
