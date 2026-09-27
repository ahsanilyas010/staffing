import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const revalidate = 0

const statusColor: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500',
  submitted: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  rejected: 'bg-red-50 text-red-600',
}

export default async function TimesheetsPage() {
  const supabase = createClient()

  const { data: timesheets } = await supabase
    .from('timesheets')
    .select('*, placements(candidates(first_name,last_name), requisitions(clients(name)))')
    .order('week_start', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-slate-500 text-sm mt-0.5">{timesheets?.length ?? 0} timesheets</p>
        </div>
        <a href="/api/timesheets/export" className="btn-ghost text-sm">Export approved (CSV)</a>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Client</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Week</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Hours</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {timesheets?.map((ts: any) => (
              <tr key={ts.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {ts.placements?.candidates?.first_name} {ts.placements?.candidates?.last_name}
                </td>
                <td className="px-4 py-3 text-slate-600">{ts.placements?.requisitions?.clients?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{ts.week_start}</td>
                <td className="px-4 py-3 text-slate-600">{ts.hours}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge', statusColor[ts.status] ?? 'bg-slate-100 text-slate-500')}>{ts.status}</span>
                </td>
              </tr>
            ))}
            {(!timesheets || timesheets.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No timesheets yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
