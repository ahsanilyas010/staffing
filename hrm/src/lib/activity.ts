import { SupabaseClient } from '@supabase/supabase-js'

export async function logActivity(
  supabase: SupabaseClient,
  params: {
    entityType: 'candidate' | 'application' | 'interview' | 'offer' | 'onboarding'
    entityId: string
    actor?: string
    action: string
    reason?: string
    metadata?: Record<string, unknown>
  }
) {
  await supabase.from('activity_log').insert({
    entity_type: params.entityType,
    entity_id: params.entityId,
    actor: params.actor ?? 'system',
    action: params.action,
    reason: params.reason ?? null,
    metadata: params.metadata ?? {},
  })
}
