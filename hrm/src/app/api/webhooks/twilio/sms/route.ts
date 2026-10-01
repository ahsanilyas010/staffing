import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

// Twilio posts application/x-www-form-urlencoded for inbound SMS
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const from = (form.get('From') as string | null)?.replace('whatsapp:', '') ?? ''
  const body = ((form.get('Body') as string | null) ?? '').trim().toUpperCase()

  const supabase = createServiceClient()

  if (body === 'STOP') {
    const { data: candidates } = await supabase
      .from('candidates')
      .update({ do_not_contact: true })
      .eq('phone', from)
      .select('id')

    for (const c of candidates ?? []) {
      await logActivity(supabase, {
        entityType: 'candidate',
        entityId: c.id,
        action: 'opted_out',
        reason: 'Replied STOP',
      })
    }
  }

  // Twilio expects TwiML (or empty 200) — empty response is fine for a one-way inbound handler
  return new NextResponse('<Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
