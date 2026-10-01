import { createClient } from '@/lib/supabase/server'
import ClientsList from '@/components/ClientsList'

export const revalidate = 0

export default async function ClientsPage() {
  const supabase = createClient()

  const { data: clients } = await supabase.from('clients').select('*').order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Staff augmentation client accounts — new leads from the website are in{' '}
          <a href="/requirements" className="text-brand-600 hover:underline">Client Requirements</a>, convert one from there.
        </p>
      </div>
      <ClientsList clients={clients ?? []} />
    </div>
  )
}
