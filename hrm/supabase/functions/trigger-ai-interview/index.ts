import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { candidate_id, application_id, job_type = 'general' } = await req.json()

    if (!candidate_id) {
      return new Response(JSON.stringify({ error: 'candidate_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch candidate record
    const { data: candidate, error: cErr } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, email, phone, preferred_role')
      .eq('id', candidate_id)
      .single()

    if (cErr || !candidate) {
      return new Response(JSON.stringify({ error: 'Candidate not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!candidate.phone) {
      return new Response(JSON.stringify({ error: 'Candidate has no phone number on record' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const vapiApiKey   = Deno.env.get('VAPI_API_KEY')!
    const assistantId  = Deno.env.get(`VAPI_ASSISTANT_ID_${job_type.toUpperCase()}`)
                      || Deno.env.get('VAPI_ASSISTANT_ID_GENERAL')!

    // Create interview record first to get the id for metadata
    const { data: interview, error: iErr } = await supabase
      .from('interviews')
      .insert({
        candidate_id,
        application_id: application_id || null,
        type: 'ai_voice',
        status: 'scheduled',
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (iErr) throw iErr

    // Trigger Vapi call
    const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId,
        customer: {
          number: candidate.phone,
          name: `${candidate.first_name} ${candidate.last_name}`,
        },
        assistantOverrides: {
          variableValues: {
            candidate_name: candidate.first_name,
            candidate_role: candidate.preferred_role || 'the position',
            interview_id: interview.id,
            candidate_id,
            application_id: application_id || '',
          }
        },
        metadata: {
          interview_id: interview.id,
          candidate_id,
          application_id: application_id || '',
        }
      })
    })

    if (!vapiRes.ok) {
      const vapiErr = await vapiRes.text()
      // Clean up the interview record if call failed
      await supabase.from('interviews').delete().eq('id', interview.id)
      throw new Error(`Vapi error: ${vapiErr}`)
    }

    const vapiCall = await vapiRes.json()

    // Store Vapi call ID on the interview record
    await supabase
      .from('interviews')
      .update({
        vapi_call_id: vapiCall.id,
        status: 'in_progress',
      })
      .eq('id', interview.id)

    // Update candidate last_activity
    await supabase
      .from('candidates')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', candidate_id)

    return new Response(JSON.stringify({
      success: true,
      interview_id: interview.id,
      vapi_call_id: vapiCall.id,
      message: `AI interview call initiated to ${candidate.phone}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('trigger-ai-interview error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
