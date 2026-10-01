import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientPortal from '@/components/ClientPortal'

export const revalidate = 0

export default async function ClientPortalPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/client/login')

  const { data: client } = await supabase.from('clients').select('id, name, slug').eq('slug', params.slug).single()
  if (!client) redirect('/client/login')

  const { data: membership } = await supabase
    .from('client_users')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .eq('client_id', client.id)
    .single()

  if (!membership) redirect('/client/login')

  const { data: requisitions } = await supabase
    .from('requisitions')
    .select('id, headcount, status, jobs(title)')
    .eq('client_id', client.id)

  const requisitionIds = (requisitions ?? []).map((r) => r.id)

  const { data: requisitionCandidates } = requisitionIds.length
    ? await supabase
        .from('requisition_candidates')
        .select('id, status, similarity, requisition_id, candidate_id')
        .in('requisition_id', requisitionIds)
    : { data: [] }

  const candidateIds = [...new Set((requisitionCandidates ?? []).map((rc) => rc.candidate_id))]

  const { data: candidateProfiles } = candidateIds.length
    ? await supabase
        .from('client_candidate_view')
        .select('id,first_name,last_name,preferred_role,experience_years,skills,country')
        .in('id', candidateIds)
    : { data: [] }

  const profileById = new Map((candidateProfiles ?? []).map((c) => [c.id, c]))
  const submittedCandidates = (requisitionCandidates ?? []).map((rc) => ({
    ...rc,
    candidate: profileById.get(rc.candidate_id) ?? null,
  }))

  const { data: placements } = await supabase
    .from('placements')
    .select('id, start_date, end_date, status, requisitions!inner(client_id), candidates(first_name,last_name)')
    .eq('requisitions.client_id', client.id)

  const placementIds = (placements ?? []).map((p) => p.id)

  const { data: pendingTimesheets } = placementIds.length
    ? await supabase
        .from('timesheets')
        .select('id, week_start, hours, status, placements(candidates(first_name,last_name))')
        .in('placement_id', placementIds)
        .eq('status', 'submitted')
    : { data: [] }

  return (
    <ClientPortal
      client={client}
      requisitions={(requisitions ?? []) as any}
      submittedCandidates={submittedCandidates as any}
      placements={(placements ?? []) as any}
      pendingTimesheets={(pendingTimesheets ?? []) as any}
    />
  )
}
