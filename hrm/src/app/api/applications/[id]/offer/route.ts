import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { renderOfferLetterPdf } from '@/lib/pdf/offerLetter'
import { logActivity } from '@/lib/activity'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { salary_pkr, start_date, probation_days } = await request.json()

  const { data: application } = await supabase
    .from('applications')
    .select('id, candidate_id, job_id, candidates(first_name, last_name), jobs(title, location, entities(name))')
    .eq('id', params.id)
    .single()

  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const candidate = (application as any).candidates
  const job = (application as any).jobs
  const entityName = job?.entities?.name ?? 'Assorted Group'

  const pdfBuffer = await renderOfferLetterPdf({
    entityName,
    candidateName: `${candidate.first_name} ${candidate.last_name}`,
    role: job?.title ?? 'the role',
    salaryPkr: salary_pkr,
    startDate: start_date,
    probationDays: probation_days ?? 90,
    location: job?.location ?? 'Islamabad',
  })

  const service = createServiceClient()
  const fileName = `${params.id}_${Date.now()}.pdf`
  const { error: uploadError } = await service.storage
    .from('offers')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)

  const { data: offer, error } = await supabase
    .from('offers')
    .insert({
      application_id: params.id,
      salary_pkr,
      start_date,
      probation_days: probation_days ?? 90,
      pdf_url: fileName,
      status: 'sent',
      sent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      created_by: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: offerStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('stage_type', 'offer')
    .single()

  if (offerStage) {
    await supabase.from('applications').update({ stage_id: offerStage.id }).eq('id', params.id)
  }

  const appBase = process.env.APP_BASE_URL ?? 'https://staffing.assorted.group'

  await supabase.from('outbound_messages').insert([
    {
      candidate_id: application.candidate_id,
      application_id: params.id,
      channel: 'whatsapp',
      template_key: 'offerSent',
      payload: { role: job?.title ?? 'the role', entity: entityName, link: `${appBase}/offer/${offer.token}` },
      scheduled_for: new Date().toISOString(),
    },
    {
      candidate_id: application.candidate_id,
      application_id: params.id,
      channel: 'sms',
      template_key: 'offerReminder',
      payload: { role: job?.title ?? 'the role', link: `${appBase}/offer/${offer.token}` },
      scheduled_for: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    },
  ])

  await logActivity(supabase, {
    entityType: 'offer',
    entityId: offer.id,
    actor: session.user.id,
    action: 'offer_sent',
    reason: `PKR ${salary_pkr}, starting ${start_date}`,
  })

  return NextResponse.json({ offer_id: offer.id, token: offer.token })
}
