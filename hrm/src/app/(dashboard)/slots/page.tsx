import { createClient } from '@/lib/supabase/server'
import { formatDate, cn } from '@/lib/utils'

export const revalidate = 0

export default async function SlotsPage() {
  const supabase = createClient()

  const { data: slots } = await supabase
    .from('interview_slots')
    .select('*')
    .gt('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(200)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Interview Slots</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Upcoming self-schedule availability — 15-minute slots, 13:00–17:00 PKT, Mon–Sat
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">When</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Booked</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slots?.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900 font-medium">{formatDate(s.starts_at)}</td>
                <td className="px-4 py-3 text-slate-600">{s.location}</td>
                <td className="px-4 py-3 text-slate-600">{s.booked}/{s.capacity}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge', s.blocked ? 'bg-slate-100 text-slate-500' : s.booked >= s.capacity ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600')}>
                    {s.blocked ? 'Blocked' : s.booked >= s.capacity ? 'Full' : 'Open'}
                  </span>
                </td>
              </tr>
            ))}
            {(!slots || slots.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">No upcoming slots</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
