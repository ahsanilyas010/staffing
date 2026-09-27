import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/activity'

// Twilio posts application/x-www-form-urlencoded for inbound WhatsApp messages
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
        reason: 'Replied STOP via WhatsApp',
      })
    }

    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Any other inbound message from a new number gets the apply link back.
  const appBase = process.env.APP_BASE_URL ?? 'https://staffing.assorted.group'
  const replyText = `Thanks for reaching out to Assorted Group! Browse open roles and apply here: ${appBase}/apply`

  const twiml = `<Response><Message>${replyText}</Message></Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
