import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logActivity } from '@/lib/activity'

interface CsvRow {
  first_name: string
  last_name: string
  email: string
  phone?: string
  country?: string
  preferred_role?: string
  experience_years?: string
  source?: string
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, i) => (row[h] = values[i] ?? ''))
    return row as unknown as CsvRow
  })
}

export async function POST(request: NextRequest) {
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
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { csv, source } = body as { csv: string; source: string }

  const rows = parseCsv(csv)

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    if (!row.first_name || !row.last_name || !row.email) {
      skipped++
      continue
    }

    const { data: candidate, error: insertError } = await supabase
      .from('candidates')
      .insert({
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone ?? null,
        country: row.country ?? null,
        preferred_role: row.preferred_role ?? null,
        experience_years: row.experience_years ?? null,
        consent: true,
        status: 'new',
        source: row.source ?? source ?? 'csv_import',
      })
      .select()
      .single()

    if (insertError) {
      errors.push(`${row.email}: ${insertError.message}`)
      skipped++
      continue
    }

    // candidates_after_insert (migration 003) already created the application row

    await logActivity(supabase, {
      entityType: 'candidate',
      entityId: candidate.id,
      actor: session.user.id,
      action: 'imported',
      reason: `CSV import: ${source ?? 'manual'}`,
    })

    imported++
  }

  return NextResponse.json({ imported, skipped, errors })
}
