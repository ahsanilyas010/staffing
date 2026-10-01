import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const revalidate = 0

export default async function OnboardingPage() {
  const supabase = createClient()

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('stage_type', 'onboarding')
    .single()

  const { data: applications } = await supabase
    .from('applications')
    .select('id, candidate_id, candidates(first_name,last_name), jobs(title)')
    .eq('stage_id', stage?.id ?? '')

  const appIds = (applications ?? []).map((a) => a.id)

  const { data: items } = appIds.length
    ? await supabase.from('onboarding_items').select('application_id, status, required').in('application_id', appIds)
    : { data: [] }

  const progressByApp = (applications ?? []).map((app) => {
    const appItems = (items ?? []).filter((i) => i.application_id === app.id)
    const required = appItems.filter((i) => i.required)
    const done = required.filter((i) => i.status === 'submitted' || i.status === 'approved')
    return { ...app, total: required.length, done: done.length }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Onboarding</h1>
        <p className="text-slate-500 text-sm mt-0.5">{progressByApp.length} candidates onboarding</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Progress</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {progressByApp.map((app: any) => (
              <tr key={app.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {app.candidates?.first_name} {app.candidates?.last_name}
                </td>
                <td className="px-4 py-3 text-slate-600">{app.jobs?.title ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{app.done}/{app.total} complete</td>
                <td className="px-4 py-3">
                  <Link href={`/onboard/${app.id}`} target="_blank" className="text-orange-600 text-xs font-medium">
                    View portal →
                  </Link>
                </td>
              </tr>
            ))}
            {progressByApp.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-400">No one onboarding right now</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
