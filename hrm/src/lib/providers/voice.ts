// Vapi.ai voice call adapter
// All Vapi interactions go through here — no Vapi SDK imported elsewhere

const VAPI_BASE = 'https://api.vapi.ai'

interface CallParams {
  phoneNumber: string
  assistantId: string
  assistantOverrides?: {
    model?: { messages?: { role: string; content: string }[] }
    firstMessage?: string
  }
  metadata?: Record<string, string>
}

interface CallResult {
  id: string
  status: string
  phoneNumberId?: string
}

export async function createCall(params: CallParams): Promise<CallResult> {
  const res = await fetch(`${VAPI_BASE}/call/phone`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: params.phoneNumber },
      assistantId: params.assistantId,
      assistantOverrides: params.assistantOverrides,
      metadata: params.metadata,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Vapi createCall failed: ${res.status} ${err}`)
  }
  return res.json()
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (!secret) return false
  // Vapi sends HMAC-SHA256 hex in x-vapi-signature header
  const crypto = require('crypto')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
