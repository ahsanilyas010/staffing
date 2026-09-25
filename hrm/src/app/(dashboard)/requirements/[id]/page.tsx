import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RequirementDetail from '@/components/RequirementDetail'
import type { ClientRequirement, ClientRequirementNote, HrUser, HrUserRole } from '@/lib/supabase/types'

export const revalidate = 0

export default async function RequirementPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: requirement }, { data: notes }, { data: hrUsers }, { data: role }] = await Promise.all([
    supabase
      .from('client_requirements')
      .select('*, assignee:hr_users(id,full_name,email)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('client_requirement_notes')
      .select('*, author:hr_users(id,full_name,email)')
      .eq('requirement_id', params.id)
      .order('created_at', { ascending: false }),
    supabase.from('hr_users').select('id,full_name,email').order('full_name'),
    supabase.rpc('hr_role'),
  ])

  if (!requirement) notFound()

  return (
    <RequirementDetail
      requirement={requirement as ClientRequirement}
      notes={(notes ?? []) as ClientRequirementNote[]}
      hrUsers={(hrUsers ?? []) as Pick<HrUser, 'id' | 'full_name' | 'email'>[]}
      role={(role as HrUserRole | null) ?? null}
    />
  )
}
