import { SupabaseClient } from '@supabase/supabase-js'

function mondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export async function runGenerateTimesheets(supabase: SupabaseClient) {
  const weekStart = mondayOf(new Date())

  const { data: activePlacements } = await supabase
    .from('placements')
    .select('id, candidate_id, candidates(phone)')
    .eq('status', 'active')

  let created = 0
  for (const placement of activePlacements ?? []) {
    const { data: existing } = await supabase
      .from('timesheets')
      .select('id')
      .eq('placement_id', placement.id)
      .eq('week_start', weekStart)
      .maybeSingle()

    if (existing) continue

    const { data: timesheet } = await supabase
      .from('timesheets')
      .insert({ placement_id: placement.id, week_start: weekStart })
      .select()
      .single()

    if (timesheet) {
      await supabase.from('outbound_messages').insert({
        candidate_id: placement.candidate_id,
        channel: 'whatsapp',
        template_key: 'onboardingInvite',
        payload: {
          entity: 'Assorted Staffing',
          link: `${process.env.APP_BASE_URL}/timesheet/${timesheet.token}`,
        },
        scheduled_for: new Date().toISOString(),
      })
      created++
    }
  }

  return { created, weekStart }
}
