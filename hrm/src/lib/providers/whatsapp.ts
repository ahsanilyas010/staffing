// Twilio WhatsApp adapter — falls back to SMS until Meta Business verification completes
const TWILIO_BASE = 'https://api.twilio.com/2010-04-01'

function auth() {
  return Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64')
}

export async function sendWhatsApp(to: string, body: string): Promise<{ sid: string; channel: 'whatsapp' | 'sms' }> {
  const waFrom = process.env.TWILIO_WHATSAPP_FROM
  if (waFrom) {
    try {
      const res = await fetch(
        `${TWILIO_BASE}/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: `whatsapp:${waFrom}`,
            To: `whatsapp:${to}`,
            Body: body,
          }),
        }
      )
      if (res.ok) {
        const data = await res.json()
        return { sid: data.sid, channel: 'whatsapp' }
      }
    } catch {
      // fall through to SMS
    }
  }

  // Fallback to SMS
  const { sendSms } = await import('./sms')
  const result = await sendSms(to, body)
  return { ...result, channel: 'sms' }
}
