import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logActivity } from '@/lib/activity'

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

  const { error } = await supabase
    .from('timesheets')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: session.user.id })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logActivity(supabase, {
    entityType: 'timesheet',
    entityId: params.id,
    actor: session.user.id,
    action: 'timesheet_approved',
  })

  return NextResponse.json({ ok: true })
}
