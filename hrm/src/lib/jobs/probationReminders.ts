import { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity'

export async function runProbationReminders(supabase: SupabaseClient) {
  const sevenDaysOut = new Date()
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
  const dateStr = sevenDaysOut.toISOString().slice(0, 10)

  const { data: employees } = await supabase
    .from('employees')
    .select('id, candidate_id, status, probation_end')
    .eq('status', 'on_probation')
    .eq('probation_end', dateStr)

  let reminded = 0
  for (const emp of employees ?? []) {
    await logActivity(supabase, {
      entityType: 'candidate',
      entityId: emp.candidate_id,
      action: 'probation_ending_soon',
      reason: `Probation ends ${emp.probation_end} — HR review needed`,
    })
    reminded++
  }

  return { reminded }
}
