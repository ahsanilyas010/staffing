import { SupabaseClient } from '@supabase/supabase-js'
import { extractJson } from '@/lib/providers/llm'
import { logActivity } from '@/lib/activity'

interface ScoreExtraction {
  fit_score: number
  communication_score: number
  english_level: number
  urdu_level: number
  salary_expectation_pkr: number | null
  salary_within_band: boolean
  availability_date: string | null
  notice_period_days: number | null
  shift_ok: boolean | null
  knockouts_failed: string[]
  alternate_job_slugs: string[]
  red_flags: string[]
  summary: string
  recommendation: 'shortlist' | 'reject' | 'hold'
}

export async function runScreeningScore(
  supabase: SupabaseClient,
  payload: { interview_id: string; application_id: string }
) {
  const { data: interview } = await supabase
    .from('interviews')
    .select('id, application_id, candidate_id')
    .eq('id', payload.interview_id)
    .single()

  const { data: transcript } = await supabase
    .from('interview_transcripts')
    .select('id, transcript, ai_summary')
    .eq('interview_id', payload.interview_id)
    .single()

  const { data: application } = await supabase
    .from('applications')
    .select('id, job_id, jobs(title, must_have_skills, nice_to_have_skills, screening_questions, knockout_rules, auto_rules)')
    .eq('id', payload.application_id)
    .single()

  if (!interview || !transcript || !application) return

  const job = (application as any).jobs

  const extraction = await extractJson<ScoreExtraction>({
    system: `You extract structured hiring-screen data from a call transcript. Respond with ONLY valid JSON matching this exact shape, no prose:
{"fit_score":0,"communication_score":0,"english_level":1,"urdu_level":1,"salary_expectation_pkr":null,"salary_within_band":false,"availability_date":null,"notice_period_days":null,"shift_ok":null,"knockouts_failed":[],"alternate_job_slugs":[],"red_flags":[],"summary":"","recommendation":"shortlist|reject|hold"}
Scores are 0-100. Levels are 1-5. Job requirements: ${JSON.stringify(job)}`,
    messages: [
      {
        role: 'user',
        content: `Transcript: ${JSON.stringify(transcript.transcript)}\nSummary: ${transcript.ai_summary ?? ''}`,
      },
    ],
  })

  await supabase
    .from('interview_transcripts')
    .update({ extraction, recommendation: extraction.recommendation })
    .eq('id', transcript.id)

  await supabase
    .from('applications')
    .update({
      fit_score: extraction.fit_score,
      communication_score: extraction.communication_score,
      salary_expectation_pkr: extraction.salary_expectation_pkr,
      salary_within_band: extraction.salary_within_band,
      availability_date: extraction.availability_date,
      notice_period_days: extraction.notice_period_days,
      ai_recommendation: extraction.recommendation,
    })
    .eq('id', payload.application_id)

  const autoRules = job?.auto_rules ?? {}
  const threshold = autoRules.fit_threshold ?? 65
  const salaryCap = autoRules.salary_cap_pkr

  let nextStageType: string | null = null
  let rejectionReason: string | null = null

  if (extraction.knockouts_failed.length > 0) {
    nextStageType = 'rejected'
    rejectionReason = `Knockout: ${extraction.knockouts_failed.join(', ')}`
  } else if (extraction.fit_score >= threshold && extraction.salary_within_band) {
    nextStageType = 'interview_scheduled'
  } else if (
    extraction.fit_score >= threshold &&
    salaryCap &&
    extraction.salary_expectation_pkr &&
    extraction.salary_expectation_pkr <= salaryCap * 1.2
  ) {
    nextStageType = null // hold, flagged for hiring manager
  }

  if (nextStageType) {
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('stage_type', nextStageType)
      .single()

    if (stage) {
      await supabase
        .from('applications')
        .update({
          stage_id: stage.id,
          status: nextStageType === 'rejected' ? 'rejected' : 'active',
          rejection_reason: rejectionReason,
        })
        .eq('id', payload.application_id)
    }
  }

  if (extraction.alternate_job_slugs.length > 0 && nextStageType === 'rejected') {
    const { data: altJob } = await supabase
      .from('jobs')
      .select('id')
      .eq('slug', extraction.alternate_job_slugs[0])
      .single()

    if (altJob) {
      const { data: appliedStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('stage_type', 'applied')
        .single()

      await supabase.from('applications').insert({
        candidate_id: interview.candidate_id,
        job_id: altJob.id,
        stage_id: appliedStage?.id ?? null,
        parent_application_id: payload.application_id,
        source: 'alternate_match',
        fit_score: extraction.fit_score,
        ai_recommendation: extraction.recommendation,
      })
    }
  }

  await logActivity(supabase, {
    entityType: 'application',
    entityId: payload.application_id,
    action: 'screening_scored',
    reason: `AI recommendation: ${extraction.recommendation}, fit_score: ${extraction.fit_score}`,
    metadata: extraction as unknown as Record<string, unknown>,
  })
}
