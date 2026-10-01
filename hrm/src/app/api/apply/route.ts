import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  const {
    job_slug,
    first_name,
    last_name,
    email,
    phone,
    country,
    relocation_pref,
    experience_years,
    salary_expectation,
    cv_file_path,
    cv_file_name,
    consent,
    referral_code,
  } = body

  if (!first_name || !last_name || !email || !consent) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: job } = job_slug
    ? await supabase.from('jobs').select('id, title, entity_id').eq('slug', job_slug).single()
    : { data: null }

  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .insert({
      first_name,
      last_name,
      email,
      phone,
      country,
      relocation_pref,
      preferred_role: job?.title ?? body.preferred_role,
      experience_years,
      salary_expectation,
      cv_file_path,
      cv_file_name,
      consent,
      status: 'new',
      source: job_slug ? 'apply_page' : 'website_form',
      referral_code: referral_code ?? null,
    })
    .select()
    .single()

  if (candidateError) {
    return NextResponse.json({ error: candidateError.message }, { status: 400 })
  }

  // candidates_after_insert (migration 003) already created an application row
  // for this candidate — fill it in with the job/referral details rather than
  // inserting a second one.
  const { data: application, error: applicationError } = await supabase
    .from('applications')
    .update({
      job_id: job?.id ?? null,
      referral_code: referral_code ?? null,
      next_call_at: new Date(Date.now() + 60 * 1000).toISOString(),
    })
    .eq('candidate_id', candidate.id)
    .select()
    .single()

  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 400 })
  }

  await logActivity(supabase, {
    entityType: 'candidate',
    entityId: candidate.id,
    action: 'applied',
    reason: job_slug ? `Applied to ${job?.title}` : 'Applied via website form',
  })

  await supabase.from('outbound_messages').insert({
    candidate_id: candidate.id,
    application_id: application.id,
    channel: 'sms',
    template_key: 'applyThanks',
    payload: { role: job?.title ?? body.preferred_role ?? 'a role', entity: 'Assorted Group' },
    scheduled_for: new Date().toISOString(),
  })

  return NextResponse.json({ candidate_id: candidate.id, application_id: application.id })
}
