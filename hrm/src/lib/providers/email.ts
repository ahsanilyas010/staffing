// Resend email adapter
export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  from?: string
}): Promise<{ id: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from ?? process.env.EMAIL_FROM ?? 'hello@assorted.group',
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend failed: ${res.status} ${err}`)
  }
  return res.json()
}
