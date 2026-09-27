import { createClient } from '@/lib/supabase/server'
import PlacementsList from '@/components/PlacementsList'

export const revalidate = 0

export default async function PlacementsPage() {
  const supabase = createClient()

  const { data: readyToPlace } = await supabase
    .from('requisition_candidates')
    .select('id, candidate_id, requisition_id, candidates(first_name,last_name), requisitions(clients(name), jobs(title))')
    .eq('status', 'client_approved')

  const { data: placements } = await supabase
    .from('placements')
    .select('*, candidates(first_name,last_name), requisitions(clients(name), jobs(title))')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Placements</h1>
        <p className="text-slate-500 text-sm mt-0.5">{placements?.length ?? 0} placements</p>
      </div>
      <PlacementsList readyToPlace={(readyToPlace ?? []) as any} placements={(placements ?? []) as any} />
    </div>
  )
}
