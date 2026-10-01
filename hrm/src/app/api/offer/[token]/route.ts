import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: offer } = await supabase
    .from('offers')
    .select('id, salary_pkr, start_date, probation_days, status, expires_at, pdf_url, application_id, applications(candidates(first_name,last_name), jobs(title, entities(name)))')
    .eq('token', params.token)
    .single()

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  let pdfUrl: string | null = null
  if (offer.pdf_url) {
    const { data: signed } = await supabase.storage.from('offers').createSignedUrl(offer.pdf_url, 3600)
    pdfUrl = signed?.signedUrl ?? null
  }

  const app = (offer as any).applications

  return NextResponse.json({
    candidate_name: `${app.candidates.first_name} ${app.candidates.last_name}`,
    role: app.jobs?.title,
    entity: app.jobs?.entities?.name,
    salary_pkr: offer.salary_pkr,
    start_date: offer.start_date,
    probation_days: offer.probation_days,
    status: offer.status,
    expires_at: offer.expires_at,
    pdf_url: pdfUrl,
  })
}
