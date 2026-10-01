// Deno Edge Function — dispatches a Vapi screening call for a due application.
// Invoked by the Vercel Cron -> /api/jobs/run dispatcher, or manually from the HR dashboard.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const CALLING_HOURS_START = 10 // 10:00 PKT
const CALLING_HOURS_END = 20 // 20:00 PKT

function isWithinCallingHours(): boolean {
  const now = new Date()
  const pktHour = (now.getUTCHours() + 5) % 24
  const pktDay = now.getUTCDay() // 0 = Sunday
  return pktDay !== 0 && pktHour >= CALLING_HOURS_START && pktHour < CALLING_HOURS_END
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { application_id } = await req.json()

    const { data: application, error: appErr } = await supabase
      .from('applications')
      .select('id, candidate_id, job_id, call_attempts, candidates(first_name, phone), jobs(title, screening_questions)')
      .eq('id', application_id)
      .single()

    if (appErr || !application) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!isWithinCallingHours()) {
      const nextWindow = new Date()
      nextWindow.setUTCHours(10 - 5, 0, 0, 0) // 10:00 PKT next day
      if (nextWindow < new Date()) nextWindow.setUTCDate(nextWindow.getUTCDate() + 1)
      await supabase
        .from('applications')
        .update({ next_call_at: nextWindow.toISOString() })
        .eq('id', application_id)
      return new Response(JSON.stringify({ deferred: true, next_call_at: nextWindow }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const candidate = (application as any).candidates
    const job = (application as any).jobs

    const questions = (job?.screening_questions ?? [])
      .map((q: { q: string }, i: number) => `${i + 1}. ${q.q}`)
      .join('\n')

    const systemPrompt = `You are the Assorted Group hiring assistant. Never claim to be human. Open by offering the candidate a choice of Urdu or English and continue in their choice. Confirm identity, ask about availability and notice period, ask for salary expectation in PKR, then ask the following role-fit questions:\n${questions}\nCheck any knockout conditions. If the candidate seems a better fit for an adjacent role, ask about it. Never promise a job. Close by explaining a human will follow up. Keep the call under 8 minutes.`

    const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('VAPI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: Deno.env.get('VAPI_PHONE_NUMBER_ID'),
        assistantId: Deno.env.get('VAPI_ASSISTANT_ID'),
        customer: { number: candidate.phone },
        assistantOverrides: { model: { messages: [{ role: 'system', content: systemPrompt }] } },
        metadata: { application_id, candidate_id: application.candidate_id },
      }),
    })

    if (!vapiRes.ok) {
      const errText = await vapiRes.text()
      throw new Error(`Vapi call failed: ${vapiRes.status} ${errText}`)
    }

    const call = await vapiRes.json()

    await supabase.from('interviews').insert({
      application_id,
      candidate_id: application.candidate_id,
      type: 'ai_voice',
      vapi_call_id: call.id,
      status: 'in_progress',
      attempt_no: (application.call_attempts ?? 0) + 1,
    })

    await supabase
      .from('applications')
      .update({ call_attempts: (application.call_attempts ?? 0) + 1, next_call_at: null })
      .eq('id', application_id)

    await supabase.from('activity_log').insert({
      entity_type: 'application',
      entity_id: application_id,
      actor: 'system',
      action: 'screening_call_dispatched',
      reason: `Vapi call ${call.id} started`,
    })

    return new Response(JSON.stringify({ call_id: call.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
