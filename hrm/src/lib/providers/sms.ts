// Twilio SMS adapter
const TWILIO_BASE = 'https://api.twilio.com/2010-04-01'

function auth() {
  return Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64')
}

export async function sendSms(to: string, body: string): Promise<{ sid: string }> {
  const res = await fetch(
    `${TWILIO_BASE}/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: process.env.TWILIO_SMS_FROM!,
        To: to,
        Body: body,
      }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Twilio SMS failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return { sid: data.sid }
}
