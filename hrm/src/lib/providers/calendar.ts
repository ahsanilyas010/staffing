// Google Calendar API adapter — Meet links for video interviews
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

let accessTokenCache: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (accessTokenCache && Date.now() < accessTokenCache.expiresAt) {
    return accessTokenCache.token
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google OAuth failed: ${res.status}`)
  const data = await res.json()
  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return data.access_token
}

export async function createMeetEvent(params: {
  summary: string
  startTime: string
  endTime: string
  attendeeEmail?: string
}): Promise<{ meetLink: string; eventId: string }> {
  const token = await getAccessToken()
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: params.summary,
      start: { dateTime: params.startTime, timeZone: 'Asia/Karachi' },
      end: { dateTime: params.endTime, timeZone: 'Asia/Karachi' },
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
      attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : [],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Calendar failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return {
    meetLink: data.hangoutLink ?? data.conferenceData?.entryPoints?.[0]?.uri ?? '',
    eventId: data.id,
  }
}
