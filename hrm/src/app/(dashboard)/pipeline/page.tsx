import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PipelineBoard from '@/components/PipelineBoard'
import RoleSearch from '@/components/RoleSearch'
import { likeLiteral, roleOptions } from '@/lib/filters'
import type { Candidate, PipelineStage } from '@/lib/supabase/types'

export const revalidate = 0

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: { role?: string }
}) {
  const supabase = createClient()
  const role = searchParams.role?.trim() || ''

  let candidatesQuery = supabase
    .from('candidates')
    .select('*, stage:pipeline_stages(*), assignee:hr_users(id,full_name,email)')
    .order('last_activity_at', { ascending: false })

  if (role) {
    // Partial match: "design" finds "Design Intern", "Paid Design Internship", …
    candidatesQuery = candidatesQuery.ilike('preferred_role', `%${likeLiteral(role)}%`)
  }

  const [{ data: stages }, { data: candidates }, { data: roleRows }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('*')
      .order('order_index'),
    candidatesQuery,
    supabase.from('candidates').select('preferred_role').not('preferred_role', 'is', null),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {candidates?.length ?? 0} {role ? 'matching candidates' : 'candidates'} across {stages?.length ?? 0} stages
          </p>
        </div>
        <form className="flex gap-3 flex-wrap">
          <RoleSearch value={role} roles={roleOptions(roleRows)} />
          <button type="submit" className="btn-primary">Search</button>
          {role && <Link href="/pipeline" className="btn-ghost">Clear</Link>}
        </form>
      </div>
      <PipelineBoard
        stages={(stages ?? []) as PipelineStage[]}
        candidates={(candidates ?? []) as Candidate[]}
      />
    </div>
  )
}
