import { createClient } from '@/lib/supabase/server'
import PipelineBoard from '@/components/PipelineBoard'
import type { Candidate, PipelineStage } from '@/lib/supabase/types'

export const revalidate = 0

export default async function PipelinePage() {
  const supabase = createClient()

  const [{ data: stages }, { data: candidates }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('*')
      .order('order_index'),
    supabase
      .from('candidates')
      .select('*, stage:pipeline_stages(*), assignee:hr_users(id,full_name,email)')
      .order('last_activity_at', { ascending: false }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {candidates?.length ?? 0} candidates across {stages?.length ?? 0} stages
          </p>
        </div>
      </div>
      <PipelineBoard
        stages={(stages ?? []) as PipelineStage[]}
        candidates={(candidates ?? []) as Candidate[]}
      />
    </div>
  )
}
