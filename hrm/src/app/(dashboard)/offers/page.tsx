import { createClient } from '@/lib/supabase/server'
import { formatDate, cn } from '@/lib/utils'

export const revalidate = 0

const statusColor: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500',
  sent: 'bg-amber-50 text-amber-600',
  accepted: 'bg-emerald-50 text-emerald-600',
  declined: 'bg-red-50 text-red-600',
  expired: 'bg-slate-100 text-slate-400',
}

export default async function OffersPage() {
  const supabase = createClient()

  const { data: offers } = await supabase
    .from('offers')
    .select('*, applications(candidates(first_name,last_name), jobs(title))')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Offers</h1>
        <p className="text-slate-500 text-sm mt-0.5">{offers?.length ?? 0} offers sent</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Salary (PKR)</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Start date</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {offers?.map((o: any) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {o.applications?.candidates?.first_name} {o.applications?.candidates?.last_name}
                </td>
                <td className="px-4 py-3 text-slate-600">{o.applications?.jobs?.title ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{o.salary_pkr?.toLocaleString() ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{o.start_date ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge', statusColor[o.status] ?? 'bg-slate-100 text-slate-500')}>{o.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">{o.sent_at ? formatDate(o.sent_at) : '—'}</td>
              </tr>
            ))}
            {(!offers || offers.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">No offers yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
