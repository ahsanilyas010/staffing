import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const { response } = await request.json()
  if (!['accepted', 'declined'].includes(response)) {
    return NextResponse.json({ error: 'Invalid response' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: offer } = await supabase
    .from('offers')
    .select('id, application_id, expires_at, status')
    .eq('token', params.token)
    .single()

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  if (offer.status !== 'sent') {
    return NextResponse.json({ error: 'This offer has already been responded to or has expired' }, { status: 409 })
  }

  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    await supabase.from('offers').update({ status: 'expired' }).eq('id', offer.id)
    return NextResponse.json({ error: 'This offer has expired' }, { status: 410 })
  }

  await supabase
    .from('offers')
    .update({
      status: response,
      response,
      responded_at: new Date().toISOString(),
    })
    .eq('id', offer.id)

  await logActivity(supabase, {
    entityType: 'offer',
    entityId: offer.id,
    action: `offer_${response}`,
    reason: `Candidate ${response} the offer`,
  })

  if (response === 'accepted') {
    const { data: onboardingStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('stage_type', 'onboarding')
      .single()

    if (onboardingStage) {
      await supabase.from('applications').update({ stage_id: onboardingStage.id }).eq('id', offer.application_id)
    }

    const { data: application } = await supabase
      .from('applications')
      .select('id, job_id, jobs(onboarding_checklist)')
      .eq('id', offer.application_id)
      .single()

    const checklist = ((application as any)?.jobs?.onboarding_checklist ?? []) as {
      key: string
      label: string
      required: boolean
    }[]

    if (checklist.length > 0) {
      await supabase.from('onboarding_items').insert(
        checklist.map((item) => ({
          application_id: offer.application_id,
          item_key: item.key,
          label: item.label,
          required: item.required,
        }))
      )
    }

    await logActivity(supabase, {
      entityType: 'application',
      entityId: offer.application_id,
      action: 'onboarding_started',
      reason: `${checklist.length} onboarding items created`,
    })
  } else {
    const { data: rejectedStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('stage_type', 'rejected')
      .single()

    if (rejectedStage) {
      await supabase
        .from('applications')
        .update({ stage_id: rejectedStage.id, status: 'withdrawn', rejection_reason: 'Declined offer' })
        .eq('id', offer.application_id)
    }
  }

  return NextResponse.json({ ok: true, response })
}
