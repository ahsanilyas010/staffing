import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createMeetEvent } from '@/lib/providers/calendar'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: interview } = await supabase
    .from('interviews')
    .select('id, scheduled_at, candidates(first_name, last_name, email)')
    .eq('id', params.id)
    .single()

  if (!interview || !interview.scheduled_at) {
    return NextResponse.json({ error: 'Interview must have a scheduled time' }, { status: 400 })
  }

  const start = new Date(interview.scheduled_at)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const candidate = (interview as any).candidates

  const { meetLink } = await createMeetEvent({
    summary: `Interview: ${candidate.first_name} ${candidate.last_name}`,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    attendeeEmail: candidate.email,
  })

  await supabase.from('interviews').update({ meet_link: meetLink, type: 'video' }).eq('id', params.id)

  return NextResponse.json({ meet_link: meetLink })
}
