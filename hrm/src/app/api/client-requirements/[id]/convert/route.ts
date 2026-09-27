import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

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

  const { data: lead } = await supabase.from('client_requirements').select('*').eq('id', params.id).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      name: lead.company_name,
      slug: slugify(lead.company_name),
      contacts: [{ name: lead.contact_name, email: lead.contact_email, phone: lead.contact_phone }],
      payroll_model: 'assorted_payroll',
    })
    .select()
    .single()

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 400 })

  const { data: job } = await supabase
    .from('jobs')
    .insert({
      title: lead.role_needed,
      slug: `${slugify(lead.role_needed)}-${client.slug}-${Date.now().toString(36)}`,
      client_id: client.id,
      status: 'open',
      headcount_open: lead.headcount ?? 1,
    })
    .select()
    .single()

  const { data: requisition, error: reqError } = await supabase
    .from('requisitions')
    .insert({
      client_id: client.id,
      job_id: job?.id,
      headcount: lead.headcount ?? 1,
      status: 'open',
      created_by: session.user.id,
    })
    .select()
    .single()

  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 400 })

  await supabase
    .from('client_requirements')
    .update({ status: 'converted', converted_client_id: client.id })
    .eq('id', params.id)

  return NextResponse.json({ client, requisition })
}
