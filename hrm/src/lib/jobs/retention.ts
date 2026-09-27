import { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity'

// Archive rejected candidates after 12 months, delete call recordings after 6 months.
export async function runRetention(supabase: SupabaseClient) {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: toArchive } = await supabase
    .from('applications')
    .select('id, candidate_id, candidates!inner(bench)')
    .eq('status', 'rejected')
    .lt('applied_at', twelveMonthsAgo.toISOString())
    .eq('candidates.bench', false)

  let archived = 0
  for (const app of toArchive ?? []) {
    await logActivity(supabase, {
      entityType: 'application',
      entityId: app.id,
      action: 'retention_archived',
      reason: 'Rejected application older than 12 months',
    })
    archived++
  }

  const { data: recordingsToWipe } = await supabase
    .from('interviews')
    .select('id')
    .not('recording_url', 'is', null)
    .lt('created_at', sixMonthsAgo.toISOString())

  let recordingsDeleted = 0
  for (const interview of recordingsToWipe ?? []) {
    await supabase.from('interviews').update({ recording_url: null }).eq('id', interview.id)
    recordingsDeleted++
  }

  return { archived, recordingsDeleted }
}
