import { createClient } from '@/lib/supabase/server'

export const revalidate = 0

export default async function ReportsPage() {
  const supabase = createClient()

  const [
    { data: summary },
    { data: interviews },
    { data: recent },
  ] = await Promise.all([
    supabase.rpc('pipeline_summary'),
    supabase
      .from('interviews')
      .select('status, overall_score, recommendation:interview_transcripts(recommendation)'),
    supabase
      .from('candidates')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ])

  const totalCandidates  = summary?.reduce((a: number, r: { count: number }) => a + r.count, 0) ?? 0
  const completedCalls   = interviews?.filter((i: { status: string }) => i.status === 'completed').length ?? 0
  const proceeded        = interviews?.filter((i: { recommendation?: { recommendation?: string }[] }) =>
    i.recommendation?.[0]?.recommendation === 'proceed').length ?? 0
  const passRate         = completedCalls > 0 ? Math.round((proceeded / completedCalls) * 100) : 0
  const last30Days       = recent?.length ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total candidates', value: totalCandidates },
          { label: 'New (last 30 days)', value: last30Days },
          { label: 'AI interviews done', value: completedCalls },
          { label: 'AI pass rate', value: `${passRate}%` },
        ].map(({ label, value }) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline funnel */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Pipeline Funnel</h2>
        <div className="space-y-3">
          {summary?.map((row: {
            stage_id: string
            stage_name: string
            color: string
            count: number
          }) => {
            const pct = totalCandidates > 0 ? Math.round((row.count / totalCandidates) * 100) : 0
            return (
              <div key={row.stage_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700">{row.stage_name}</span>
                  <span className="text-slate-500">{row.count} ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
