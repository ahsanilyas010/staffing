import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
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

  const { data: timesheets } = await supabase
    .from('timesheets')
    .select(
      'week_start, hours, status, placements(bill_rate_pkr, candidates(first_name,last_name), requisitions(clients(name)))'
    )
    .eq('status', 'approved')
    .order('week_start', { ascending: false })

  const rows = [
    ['Client', 'Candidate', 'Week Start', 'Hours', 'Bill Rate (PKR)', 'Amount (PKR)'],
    ...(timesheets ?? []).map((ts: any) => {
      const billRate = ts.placements?.bill_rate_pkr ?? 0
      const amount = (billRate / 40) * ts.hours // approx hourly from weekly rate assumption
      return [
        ts.placements?.requisitions?.clients?.name ?? '',
        `${ts.placements?.candidates?.first_name ?? ''} ${ts.placements?.candidates?.last_name ?? ''}`,
        ts.week_start,
        ts.hours,
        billRate,
        amount.toFixed(0),
      ]
    }),
  ]

  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="timesheets.csv"',
    },
  })
}
