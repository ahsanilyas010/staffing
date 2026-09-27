import { createClient } from '@/lib/supabase/server'
import RequisitionsList from '@/components/RequisitionsList'

export const revalidate = 0

export default async function RequisitionsPage({ searchParams }: { searchParams: { client?: string } }) {
  const supabase = createClient()

  let query = supabase
    .from('requisitions')
    .select('*, clients(name), jobs(title)')
    .order('created_at', { ascending: false })

  if (searchParams.client) query = query.eq('client_id', searchParams.client)

  const { data: requisitions } = await query
  const { data: clients } = await supabase.from('clients').select('id, name').order('name')
  const { data: jobs } = await supabase.from('jobs').select('id, title').not('client_id', 'is', null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Requisitions</h1>
        <p className="text-slate-500 text-sm mt-0.5">Open client headcount requests</p>
      </div>
      <RequisitionsList requisitions={requisitions ?? []} clients={clients ?? []} jobs={jobs ?? []} />
    </div>
  )
}
