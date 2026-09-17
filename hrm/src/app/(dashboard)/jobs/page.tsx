import { createClient } from '@/lib/supabase/server'
import { formatDate, cn } from '@/lib/utils'
import type { Job } from '@/lib/supabase/types'

export const revalidate = 0

const statusColors: Record<string, string> = {
  open: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  filled: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

export default async function JobsPage() {
  const supabase = createClient()
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
        <span className="text-slate-500 text-sm">{jobs?.length ?? 0} total</span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Title</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Department</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs?.map((job: Job) => (
              <tr key={job.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{job.title}</td>
                <td className="px-4 py-3 text-slate-600">{job.department ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{job.type}</td>
                <td className="px-4 py-3 text-slate-600">{job.location ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge capitalize', statusColors[job.status] ?? '')}>
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDate(job.created_at)}</td>
              </tr>
            ))}
            {(!jobs || jobs.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No jobs yet — add your first role via Supabase or the API
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
