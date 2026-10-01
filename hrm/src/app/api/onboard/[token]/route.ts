import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// token === application id
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: application } = await supabase
    .from('applications')
    .select('id, candidate_id, job_id, candidates(first_name, last_name), jobs(title, entities(name))')
    .eq('id', params.token)
    .single()

  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: items } = await supabase
    .from('onboarding_items')
    .select('id, item_key, label, required, status, file_url, completed_at')
    .eq('application_id', params.token)
    .order('created_at')

  return NextResponse.json({
    candidate: (application as any).candidates,
    job: (application as any).jobs,
    items: items ?? [],
  })
}
