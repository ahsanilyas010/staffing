import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate, cn } from '@/lib/utils'

export const revalidate = 0

const statusColor: Record<string, string> = {
  scheduled: 'bg-indigo-50 text-indigo-600',
  in_progress: 'bg-amber-50 text-amber-600',
  completed: 'bg-emerald-50 text-emerald-600',
  no_show: 'bg-red-50 text-red-600',
  cancelled: 'bg-slate-100 text-slate-500',
}

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string }
}) {
  const supabase = createClient()
  const { type, status } = searchParams

  let query = supabase
    .from('interviews')
    .select('*, candidates(first_name, last_name, phone), applications(job_id, jobs(title))')
    .order('created_at', { ascending: false })
    .limit(100)

  if (type) query = query.eq('type', type)
  if (status) query = query.eq('status', status)

  const { data: interviews } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Interviews</h1>
          <p className="text-slate-500 text-sm mt-0.5">AI voice screens and in-person / video interviews</p>
        </div>
      </div>

      <form className="flex gap-3 flex-wrap">
        <select name="type" defaultValue={type} className="input max-w-[180px]">
          <option value="">All types</option>
          <option value="ai_voice">AI voice screen</option>
          <option value="in_person">In-person</option>
          <option value="video">Video</option>
          <option value="phone">Phone</option>
        </select>
        <select name="status" defaultValue={status} className="input max-w-[180px]">
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="no_show">No show</option>
        </select>
        <button type="submit" className="btn-primary">Filter</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">When</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {interviews?.map((iv: any) => (
              <tr key={iv.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/candidates/${iv.candidate_id}`} className="font-medium text-slate-900 hover:text-brand-600">
                    {iv.candidates?.first_name} {iv.candidates?.last_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{iv.applications?.jobs?.title ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{iv.type.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-slate-500">
                  {iv.scheduled_at ? formatDate(iv.scheduled_at) : iv.completed_at ? formatDate(iv.completed_at) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('badge', statusColor[iv.status] ?? 'bg-slate-100 text-slate-500')}>
                    {iv.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{iv.overall_score ?? '—'}</td>
              </tr>
            ))}
            {(!interviews || interviews.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No interviews yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
