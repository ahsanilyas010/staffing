import { createClient } from '@/lib/supabase/server'

export const revalidate = 0

export default async function ReportsPage() {
  const supabase = createClient()

  const [
    { data: summary },
    { data: interviews },
    { data: recent },
    { data: candidatesBySource },
    { data: bench },
    { data: requisitions },
    { data: employees },
  ] = await Promise.all([
    supabase.rpc('pipeline_summary'),
    supabase.from('interviews').select('status, overall_score, cost_usd, duration_seconds, type'),
    supabase.from('candidates').select('created_at').gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
    supabase.from('candidates').select('source'),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('bench', true),
    supabase.from('requisitions').select('id, status, created_at, updated_at'),
    supabase.from('employees').select('id, status, joining_date'),
  ])

  const { data: applications } = await supabase.from('applications').select('ai_recommendation, human_decision, status')

  const totalCandidates = summary?.reduce((a: number, r: { count: number }) => a + r.count, 0) ?? 0
  const last30Days = recent?.length ?? 0

  const voiceCalls = interviews?.filter((i: any) => i.type === 'ai_voice') ?? []
  const completedCalls = voiceCalls.filter((i: any) => i.status === 'completed')
  const noShowCalls = voiceCalls.filter((i: any) => i.status === 'no_show')
  const answerRate = voiceCalls.length > 0 ? Math.round((completedCalls.length / voiceCalls.length) * 100) : 0
  const avgDuration = completedCalls.length
    ? Math.round(completedCalls.reduce((s: number, i: any) => s + (i.duration_seconds ?? 0), 0) / completedCalls.length)
    : 0
  const totalCost = voiceCalls.reduce((s: number, i: any) => s + (i.cost_usd ?? 0), 0)
  const costPerScreening = completedCalls.length ? (totalCost / completedCalls.length).toFixed(2) : '0.00'

  const autoRejected = applications?.filter((a: any) => a.ai_recommendation === 'reject').length ?? 0
  const overridden = applications?.filter(
    (a: any) => a.human_decision && a.ai_recommendation && a.human_decision !== a.ai_recommendation
  ).length ?? 0
  const scoredCount = applications?.filter((a: any) => a.ai_recommendation).length ?? 0
  const autoRejectRate = scoredCount ? Math.round((autoRejected / scoredCount) * 100) : 0
  const overrideRate = scoredCount ? Math.round((overridden / scoredCount) * 100) : 0

  const sourceCounts = (candidatesBySource ?? []).reduce<Record<string, number>>((acc, c: any) => {
    const key = c.source ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const inPersonInterviews = interviews?.filter((i: any) => i.type === 'in_person') ?? []
  const noShowRate = inPersonInterviews.length
    ? Math.round((inPersonInterviews.filter((i: any) => i.status === 'no_show').length / inPersonInterviews.length) * 100)
    : 0

  const openRequisitions = requisitions?.filter((r: any) => r.status === 'open') ?? []
  const filledRequisitions = requisitions?.filter((r: any) => r.status === 'filled') ?? []
  const avgAgeingDays = openRequisitions.length
    ? Math.round(
        openRequisitions.reduce((s: number, r: any) => s + (Date.now() - new Date(r.created_at).getTime()) / 86_400_000, 0) /
          openRequisitions.length
      )
    : 0
  const avgTimeToFillDays = filledRequisitions.length
    ? Math.round(
        filledRequisitions.reduce(
          (s: number, r: any) => s + (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000,
          0
        ) / filledRequisitions.length
      )
    : 0

  const benchSize = bench?.length ?? 0
  const activeEmployees = employees?.filter((e: any) => e.status === 'active' || e.status === 'on_probation').length ?? 0
  const terminatedEmployees = employees?.filter((e: any) => e.status === 'terminated' || e.status === 'resigned').length ?? 0
  const totalEmployees = (employees?.length ?? 0) || 1
  const retentionRate = Math.round((activeEmployees / totalEmployees) * 100)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total candidates', value: totalCandidates },
          { label: 'New (last 30 days)', value: last30Days },
          { label: 'On bench', value: benchSize },
          { label: 'Active employees', value: activeEmployees },
        ].map(({ label, value }) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Pipeline Funnel</h2>
        <div className="space-y-3">
          {summary?.map((row: { stage_id: string; stage_name: string; color: string; count: number }) => {
            const pct = totalCandidates > 0 ? Math.round((row.count / totalCandidates) * 100) : 0
            return (
              <div key={row.stage_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700">{row.stage_name}</span>
                  <span className="text-slate-500">{row.count} ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: row.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">AI Voice Screening</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Answer rate</dt><dd className="font-medium">{answerRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Avg call duration</dt><dd className="font-medium">{avgDuration}s</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Cost per screening</dt><dd className="font-medium">${costPerScreening}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Auto-reject rate</dt><dd className="font-medium">{autoRejectRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">HR override rate</dt><dd className="font-medium">{overrideRate}%</dd></div>
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Source Performance</h2>
          <dl className="space-y-2 text-sm">
            {Object.entries(sourceCounts).map(([source, count]) => (
              <div key={source} className="flex justify-between">
                <dt className="text-slate-500 capitalize">{source.replace('_', ' ')}</dt>
                <dd className="font-medium">{count}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Interview No-Shows</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">No-show rate</dt><dd className="font-medium">{noShowRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Total in-person interviews</dt><dd className="font-medium">{inPersonInterviews.length}</dd></div>
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Staff Augmentation</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Open requisitions</dt><dd className="font-medium">{openRequisitions.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Avg requisition ageing</dt><dd className="font-medium">{avgAgeingDays}d</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Avg time-to-fill</dt><dd className="font-medium">{avgTimeToFillDays}d</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Employee retention</dt><dd className="font-medium">{retentionRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Terminated/resigned</dt><dd className="font-medium">{terminatedEmployees}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  )
}
