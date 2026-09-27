import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

// token === application id. Accepts either a file upload (multipart) for document items,
// or a base64 signature data URL (JSON) for the signed_contract item.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()
  const contentType = request.headers.get('content-type') ?? ''

  let itemKey: string
  let fileUrl: string

  if (contentType.includes('application/json')) {
    const { item_key, signature_data_url } = await request.json()
    itemKey = item_key
    const base64 = signature_data_url.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')
    const fileName = `${params.token}/${itemKey}_${Date.now()}.png`
    const { error } = await supabase.storage.from('onboarding').upload(fileName, buffer, {
      contentType: 'image/png',
      upsert: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    fileUrl = fileName
  } else {
    const form = await request.formData()
    itemKey = form.get('item_key') as string
    const file = form.get('file') as File
    const ext = file.name.split('.').pop()
    const fileName = `${params.token}/${itemKey}_${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage.from('onboarding').upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    fileUrl = fileName
  }

  const { data: item, error: updateError } = await supabase
    .from('onboarding_items')
    .update({ status: 'submitted', file_url: fileUrl, completed_at: new Date().toISOString() })
    .eq('application_id', params.token)
    .eq('item_key', itemKey)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  await logActivity(supabase, {
    entityType: 'onboarding',
    entityId: item.id,
    action: 'onboarding_item_submitted',
    reason: itemKey,
  })

  // Check if all required items are done — if so, complete onboarding
  const { data: remaining } = await supabase
    .from('onboarding_items')
    .select('id')
    .eq('application_id', params.token)
    .eq('required', true)
    .neq('status', 'submitted')
    .neq('status', 'approved')

  if (!remaining || remaining.length === 0) {
    await completeOnboarding(supabase, params.token)
  }

  return NextResponse.json({ ok: true })
}

async function completeOnboarding(supabase: ReturnType<typeof createServiceClient>, applicationId: string) {
  const { data: application } = await supabase
    .from('applications')
    .select('id, candidate_id, job_id, jobs(entity_id, client_id)')
    .eq('id', applicationId)
    .single()

  if (!application) return

  const job = (application as any).jobs
  const isClientPlacement = !!job?.client_id

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('stage_type', isClientPlacement ? 'placed' : 'hired')
    .single()

  await supabase
    .from('applications')
    .update({
      stage_id: stage?.id ?? undefined,
      status: 'hired',
      hired_at: new Date().toISOString(),
    })
    .eq('id', applicationId)

  const joiningDate = new Date()
  const probationEnd = new Date(joiningDate)
  probationEnd.setDate(probationEnd.getDate() + 90)

  await supabase.from('employees').insert({
    candidate_id: application.candidate_id,
    entity_id: job?.entity_id ?? null,
    job_id: application.job_id,
    application_id: applicationId,
    joining_date: joiningDate.toISOString().slice(0, 10),
    probation_end: probationEnd.toISOString().slice(0, 10),
    status: 'on_probation',
  })

  await logActivity(supabase, {
    entityType: 'application',
    entityId: applicationId,
    action: 'onboarding_completed',
    reason: 'All required onboarding items submitted — employee record created',
  })
}
