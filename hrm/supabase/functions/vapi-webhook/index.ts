import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PASS_SCORE_THRESHOLD = 6.0  // candidates scoring ≥ 6 auto-advance to HR Interview

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify webhook secret from Vapi
    const webhookSecret = Deno.env.get('VAPI_WEBHOOK_SECRET')
    if (webhookSecret) {
      const signature = req.headers.get('x-vapi-secret')
      if (signature !== webhookSecret) {
        return new Response('Unauthorized', { status: 401 })
      }
    }

    const payload = await req.json()
    const { message } = payload

    if (!message?.type) {
      return new Response('ok', { status: 200 })
    }

    const callId = message.call?.id || message.callId

    switch (message.type) {

      case 'status-update': {
        if (message.status === 'in-progress') {
          await supabase
            .from('interviews')
            .update({ status: 'in_progress' })
            .eq('vapi_call_id', callId)
        }
        break
      }

      case 'end-of-call-report': {
        const call       = message.call || {}
        const analysis   = message.analysis || {}
        const transcript = message.transcript || ''
        const metadata   = call.metadata || {}

        const interviewId   = metadata.interview_id
        const candidateId   = metadata.candidate_id
        const applicationId = metadata.application_id || null

        if (!interviewId) break

        // Parse duration
        const startedAt  = call.startedAt  ? new Date(call.startedAt)  : null
        const endedAt    = call.endedAt    ? new Date(call.endedAt)    : null
        const durationSec = startedAt && endedAt
          ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
          : null

        // Derive overall score from Vapi analysis (scale 0-10)
        const rawScore = analysis.successEvaluation ?? null
        const overallScore: number | null = rawScore !== null
          ? Math.min(10, Math.max(0, parseFloat(rawScore)))
          : null

        // Derive recommendation
        let recommendation: 'proceed' | 'reject' | 'hold' = 'hold'
        if (overallScore !== null) {
          recommendation = overallScore >= PASS_SCORE_THRESHOLD ? 'proceed' : 'reject'
        }

        // Build structured transcript array
        const messages = message.messages || []
        const structuredTranscript = messages.map((m: Record<string, unknown>) => ({
          role: m.role,
          content: m.message,
          time: m.time,
        }))

        // Update interview record
        await supabase
          .from('interviews')
          .update({
            status: 'completed',
            completed_at: endedAt?.toISOString() || new Date().toISOString(),
            duration_seconds: durationSec,
            overall_score: overallScore,
            summary: analysis.summary || null,
          })
          .eq('id', interviewId)

        // Store transcript
        await supabase
          .from('interview_transcripts')
          .insert({
            interview_id: interviewId,
            transcript: structuredTranscript,
            ai_summary: analysis.summary || null,
            sentiment_score: analysis.sentimentScore || null,
            keywords_detected: analysis.keywords || [],
            questions_asked: analysis.questionsAsked || null,
            answers_scored: analysis.answersScored || null,
            recommendation,
            raw_vapi_payload: payload,
          })

        // Update candidate score and last_activity
        if (candidateId) {
          await supabase
            .from('candidates')
            .update({
              overall_score: overallScore,
              last_activity_at: new Date().toISOString(),
            })
            .eq('id', candidateId)

          // Auto-advance stage if score passes threshold
          if (recommendation === 'proceed') {
            const { data: candidate } = await supabase
              .from('candidates')
              .select('stage_id')
              .eq('id', candidateId)
              .single()

            if (candidate?.stage_id) {
              await supabase.rpc('advance_candidate_stage', {
                p_candidate_id: candidateId,
                p_current_stage_id: candidate.stage_id,
              })
            }
          }

          // Add auto-note
          const noteContent = recommendation === 'proceed'
            ? `AI screening completed. Score: ${overallScore}/10. Recommendation: Proceed to HR Interview.`
            : recommendation === 'reject'
            ? `AI screening completed. Score: ${overallScore}/10. Recommendation: Does not meet threshold at this time.`
            : `AI screening completed. Score could not be determined — manual review required.`

          await supabase
            .from('notes')
            .insert({
              candidate_id: candidateId,
              application_id: applicationId,
              content: noteContent,
              note_type: 'interview_feedback',
            })
        }

        break
      }

      case 'function-call': {
        // Mid-call function calling — Vapi can call this to log progress
        const fn = message.functionCall
        if (fn?.name === 'log_answer') {
          console.log('Mid-call log:', fn.parameters)
          // Can be extended to write real-time progress
        }
        return new Response(JSON.stringify({ result: 'logged' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response('ok', { status: 200 })

  } catch (err) {
    console.error('vapi-webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
