import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate, scoreColor, initials, cn } from '@/lib/utils'
import type { Candidate } from '@/lib/supabase/types'

export const revalidate = 0

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: { q?: string; stage?: string }
}) {
  const supabase = createClient()
  const { q, stage } = searchParams

  let query = supabase
    .from('candidates')
    .select('*, stage:pipeline_stages(id,name,color,stage_type)')
    .order('created_at', { ascending: false })

  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,preferred_role.ilike.%${q}%`
    )
  }
  if (stage) {
    query = query.eq('stage_id', stage)
  }

  const { data: candidates } = await query
  const { data: stages }     = await supabase
    .from('pipeline_stages')
    .select('id,name')
    .order('order_index')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
        <span className="text-slate-500 text-sm">{candidates?.length ?? 0} total</span>
      </div>

      {/* Filters */}
      <form className="flex gap-3 flex-wrap">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email, role…"
          className="input max-w-xs"
        />
        <select name="stage" defaultValue={stage} className="input max-w-[200px]">
          <option value="">All stages</option>
          {stages?.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary">Filter</button>
        {(q || stage) && (
          <Link href="/candidates" className="btn-ghost">Clear</Link>
        )}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Stage</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Score</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Country</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates?.map((c: Candidate) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/candidates/${c.id}`} className="flex items-center gap-3 group">
                    <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold
                                    flex items-center justify-center shrink-0">
                      {initials(c.first_name, c.last_name)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 group-hover:text-brand-600">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-slate-400 text-xs">{c.email}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.preferred_role ?? '—'}</td>
                <td className="px-4 py-3">
                  {c.stage ? (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: c.stage.color + '22',
                        color: c.stage.color,
                      }}
                    >
                      {c.stage.name}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('font-semibold', scoreColor(c.overall_score))}>
                    {c.overall_score !== null ? `${c.overall_score}/10` : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.country ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(c.created_at)}</td>
              </tr>
            ))}
            {(!candidates || candidates.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No candidates found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
