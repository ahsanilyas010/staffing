import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runScreeningDispatch } from '@/lib/jobs/screeningDispatch'
import { runScreeningScore } from '@/lib/jobs/screeningScore'
import { runNoShowSweep } from '@/lib/jobs/noShowSweep'
import { runRetention } from '@/lib/jobs/retention'
import { runProbationReminders } from '@/lib/jobs/probationReminders'
import { refreshCandidateEmbedding } from '@/lib/jobs/refreshEmbedding'
import { runGenerateTimesheets } from '@/lib/jobs/generateTimesheets'
import { createCall } from '@/lib/providers/voice'
import { sendSms } from '@/lib/providers/sms'
import { sendWhatsApp } from '@/lib/providers/whatsapp'
import { sendEmail } from '@/lib/providers/email'
import { t, type Lang } from '@/lib/copy'
import { logActivity } from '@/lib/activity'

export const maxDuration = 60

async function processQueueJob(supabase: ReturnType<typeof createServiceClient>, job: any) {
  switch (job.job_type) {
    case 'screening.trigger_call': {
      const { data: application } = await supabase
        .from('applications')
        .select('id, candidate_id, call_attempts, candidates(phone), jobs(title, screening_questions)')
        .eq('id', job.payload.application_id)
        .single()

      if (!application) throw new Error('Application not found')
      const candidate = (application as any).candidates
      const jobRow = (application as any).jobs

      const questions = (jobRow?.screening_questions ?? [])
        .map((q: { q: string }, i: number) => `${i + 1}. ${q.q}`)
        .join('\n')

      const call = await createCall({
        phoneNumber: candidate.phone,
        assistantId: process.env.VAPI_ASSISTANT_ID!,
        assistantOverrides: {
          model: {
            messages: [
              {
                role: 'system',
                content: `You are the Assorted Group hiring assistant. Never claim to be human. Offer Urdu or English and continue in the candidate's choice. Confirm identity, ask availability, notice period, salary expectation in PKR. Ask:\n${questions}\nCheck knockouts. Never promise a job. Under 8 minutes.`,
              },
            ],
          },
        },
        metadata: { application_id: application.id, candidate_id: application.candidate_id },
      })

      await supabase.from('interviews').insert({
        application_id: application.id,
        candidate_id: application.candidate_id,
        type: 'ai_voice',
        vapi_call_id: call.id,
        status: 'in_progress',
        attempt_no: (application.call_attempts ?? 0) + 1,
      })

      await supabase
        .from('applications')
        .update({ call_attempts: (application.call_attempts ?? 0) + 1, next_call_at: null })
        .eq('id', application.id)

      await logActivity(supabase, {
        entityType: 'application',
        entityId: application.id,
        action: 'screening_call_dispatched',
        reason: `Vapi call ${call.id} started`,
      })
      break
    }

    case 'screening.score': {
      await runScreeningScore(supabase, job.payload)
      break
    }

    case 'candidate.refresh_embedding': {
      await refreshCandidateEmbedding(supabase, job.payload.candidate_id)
      break
    }

    case 'message.dispatch': {
      const { data: message } = await supabase
        .from('outbound_messages')
        .select('*, candidates(phone, email, first_name)')
        .eq('id', job.payload.message_id)
        .single()

      if (!message) throw new Error('Message not found')
      const candidate = (message as any).candidates
      const lang: Lang = message.payload?.lang ?? 'en'
      const text = t(lang, message.template_key, message.payload ?? {})

      try {
        let providerId = ''
        if (message.channel === 'sms') {
          const r = await sendSms(candidate.phone, text)
          providerId = r.sid
        } else if (message.channel === 'whatsapp') {
          const r = await sendWhatsApp(candidate.phone, text)
          providerId = r.sid
        } else if (message.channel === 'email') {
          const r = await sendEmail({ to: candidate.email, subject: message.payload?.subject ?? 'Assorted Group', html: text })
          providerId = r.id
        }
        await supabase
          .from('outbound_messages')
          .update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: providerId })
          .eq('id', message.id)
      } catch (err) {
        await supabase
          .from('outbound_messages')
          .update({ status: 'failed', error: (err as Error).message })
          .eq('id', message.id)
      }
      break
    }

    default:
      throw new Error(`Unknown job_type: ${job.job_type}`)
  }
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const dispatchResult = await runScreeningDispatch(supabase)

  const { data: queuedMessages } = await supabase
    .from('outbound_messages')
    .select('id')
    .eq('status', 'queued')
    .lte('scheduled_for', new Date().toISOString())
    .limit(50)

  for (const msg of queuedMessages ?? []) {
    await supabase.from('jobs_queue').insert({
      job_type: 'message.dispatch',
      payload: { message_id: msg.id },
    })
  }

  const { data: pendingJobs } = await supabase
    .from('jobs_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at')
    .limit(50)

  let processed = 0
  let failed = 0

  for (const job of pendingJobs ?? []) {
    await supabase.from('jobs_queue').update({ status: 'running' }).eq('id', job.id)
    try {
      await processQueueJob(supabase, job)
      await supabase
        .from('jobs_queue')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', job.id)
      processed++
    } catch (err) {
      const attempts = (job.attempts ?? 0) + 1
      const maxAttempts = job.max_attempts ?? 3
      await supabase
        .from('jobs_queue')
        .update({
          status: attempts >= maxAttempts ? 'failed' : 'pending',
          attempts,
          error: (err as Error).message,
          run_at: new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      failed++
    }
  }

  const noShowResult = await runNoShowSweep(supabase)

  // Retention only needs to run once a day — cheap enough to run every invocation too,
  // but gate it to the first run of the UTC day to avoid redundant work on frequent schedules.
  const currentHourUtc = new Date().getUTCHours()
  const retentionResult = currentHourUtc === 4 ? await runRetention(supabase) : null
  const probationResult = currentHourUtc === 4 ? await runProbationReminders(supabase) : null

  const currentDayUtc = new Date().getUTCDay()
  const timesheetResult = currentDayUtc === 1 && currentHourUtc === 4 ? await runGenerateTimesheets(supabase) : null

  return NextResponse.json({
    dispatchResult,
    processed,
    failed,
    noShowResult,
    retentionResult,
    probationResult,
    timesheetResult,
  })
}
