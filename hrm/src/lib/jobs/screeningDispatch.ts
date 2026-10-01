import { SupabaseClient } from '@supabase/supabase-js'

const CALLING_HOURS_START = 10 // 10:00 PKT
const CALLING_HOURS_END = 20 // 20:00 PKT

function isWithinCallingHours(): boolean {
  const now = new Date()
  const pktHour = (now.getUTCHours() + 5) % 24
  const pktDay = now.getUTCDay()
  return pktDay !== 0 && pktHour >= CALLING_HOURS_START && pktHour < CALLING_HOURS_END
}

export async function runScreeningDispatch(supabase: SupabaseClient) {
  if (!isWithinCallingHours()) return { dispatched: 0, reason: 'outside calling hours' }

  const dailyCap = Number(process.env.SCREENING_DAILY_CAP ?? 60)
  const budgetCap = Number(process.env.VOICE_DAILY_BUDGET_USD ?? 25)

  const startOfDay = new Date()
  startOfDay.setUTCHours(-5, 0, 0, 0) // midnight PKT in UTC

  const { count: todaysCalls } = await supabase
    .from('interviews')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'ai_voice')
    .gte('created_at', startOfDay.toISOString())

  const { data: costRows } = await supabase
    .from('interviews')
    .select('cost_usd')
    .eq('type', 'ai_voice')
    .gte('created_at', startOfDay.toISOString())

  const todaysCost = (costRows ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)

  if ((todaysCalls ?? 0) >= dailyCap || todaysCost >= budgetCap) {
    return { dispatched: 0, reason: 'daily cap reached', todaysCalls, todaysCost }
  }

  const { data: due } = await supabase
    .from('applications')
    .select('id, candidates!inner(do_not_contact)')
    .lte('next_call_at', new Date().toISOString())
    .not('next_call_at', 'is', null)
    .eq('status', 'active')
    .eq('candidates.do_not_contact', false)
    .limit(dailyCap - (todaysCalls ?? 0))

  let dispatched = 0
  for (const app of due ?? []) {
    await supabase.from('jobs_queue').insert({
      job_type: 'screening.trigger_call',
      payload: { application_id: app.id },
    })
    dispatched++
  }

  return { dispatched }
}
