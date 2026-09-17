import { createClient } from '@/lib/supabase/server'
import { formatRelative, cn, scoreColor } from '@/lib/utils'
import type { Interview } from '@/lib/supabase/types'

export const revalidate = 0

const statusColors: Record<string, string> = {
  scheduled:   'bg-slate-100 text-slate-600',
  in_progress: 'bg-amber-50 text-amber-700',
  completed:   'bg-emerald-50 text-emerald-700',
  no_show:     'bg-red-50 text-red-600',
  cancelled:   'bg-slate-100 text-slate-400',
}

export default async function InterviewsPage() {
  const supabase = createClient()
  const { data: interviews } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(id,first_name,last_name,preferred_role)')
    .order('created_at', { ascending: false })
    .limit(100)

  const completed  = interviews?.filter(i => i.status === 'completed').length ?? 0
  const inProgress = interviews?.filter(i => i.status === 'in_progress').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">AI Interviews</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Total calls</p>
          <p className="text-2xl font-bold text-slate-900">{interviews?.length ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Completed</p>
          <p className="text-2xl font-bold text-emerald-600">{completed}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">In progress</p>
          <p className="text-2xl font-bold text-amber-600">{inProgress}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Score</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Duration</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Vapi Call ID</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {interviews?.map((interview: Interview) => (
              <tr key={interview.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  {interview.candidate ? (
                    <div>
                      <p className="font-medium text-slate-900">
                        {(interview.candidate as unknown as { first_name: string; last_name: string }).first_name}{' '}
                        {(interview.candidate as unknown as { first_name: string; last_name: string }).last_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {(interview.candidate as unknown as { preferred_role?: string }).preferred_role ?? ''}
                      </p>
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('badge capitalize', statusColors[interview.status] ?? '')}>
                    {interview.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('font-semibold', scoreColor(interview.overall_score))}>
                    {interview.overall_score !== null ? `${interview.overall_score.toFixed(1)}/10` : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {interview.duration_seconds
                    ? `${Math.floor(interview.duration_seconds / 60)}m ${interview.duration_seconds % 60}s`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-slate-400 truncate max-w-[120px] block">
                    {interview.vapi_call_id ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatRelative(interview.created_at)}</td>
              </tr>
            ))}
            {(!interviews || interviews.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No AI interviews yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
