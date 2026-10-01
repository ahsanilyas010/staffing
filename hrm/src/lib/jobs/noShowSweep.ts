import { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity'

export async function runNoShowSweep(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const { data: overdue } = await supabase
    .from('interviews')
    .select('id, application_id, candidate_id, scheduled_at')
    .eq('status', 'scheduled')
    .eq('type', 'in_person')
    .lt('scheduled_at', cutoff)
    .is('checked_in_at', null)

  let flagged = 0

  for (const interview of overdue ?? []) {
    await supabase.from('interviews').update({ status: 'no_show' }).eq('id', interview.id)

    const { data: application } = await supabase
      .from('applications')
      .select('id, no_show_count')
      .eq('id', interview.application_id)
      .single()

    if (!application) continue

    const newCount = (application.no_show_count ?? 0) + 1

    if (newCount >= 2) {
      const { data: rejectedStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('stage_type', 'rejected')
        .single()

      await supabase
        .from('applications')
        .update({
          no_show_count: newCount,
          status: 'rejected',
          stage_id: rejectedStage?.id ?? undefined,
          rejection_reason: 'Missed interview twice without rescheduling',
        })
        .eq('id', application.id)

      await logActivity(supabase, {
        entityType: 'application',
        entityId: application.id,
        action: 'rejected_second_no_show',
        reason: 'Second missed interview',
      })
    } else {
      await supabase.from('applications').update({ no_show_count: newCount }).eq('id', application.id)

      await supabase.from('outbound_messages').insert({
        candidate_id: interview.candidate_id,
        application_id: application.id,
        channel: 'whatsapp',
        template_key: 'noShowReschedule',
        payload: { link: `${process.env.APP_BASE_URL}/schedule/${application.id}` },
        scheduled_for: new Date().toISOString(),
      })

      await logActivity(supabase, {
        entityType: 'application',
        entityId: application.id,
        action: 'no_show_reschedule_offered',
        reason: `Missed slot at ${interview.scheduled_at}`,
      })
    }

    flagged++
  }

  return { flagged }
}
