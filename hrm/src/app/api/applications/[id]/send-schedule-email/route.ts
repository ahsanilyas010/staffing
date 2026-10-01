import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendEmail } from '@/lib/providers/email'
import { logActivity } from '@/lib/activity'

function scheduleEmailHtml(params: { candidateName: string; roleTitle: string; entityName: string; link: string }) {
  return `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
  <p style="color: #f97316; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">
    ${params.entityName}
  </p>
  <h1 style="font-size: 20px; margin: 0 0 16px;">Schedule your interview</h1>
  <p style="font-size: 14px; line-height: 1.6;">Hi ${params.candidateName},</p>
  <p style="font-size: 14px; line-height: 1.6;">
    Thanks for your interest in the <strong>${params.roleTitle}</strong> position. Please pick a time that
    works for you using the link below — it only takes a minute.
  </p>
  <p style="margin: 28px 0;">
    <a href="${params.link}"
       style="background: #f97316; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;
              padding: 12px 24px; border-radius: 8px; display: inline-block;">
      Schedule my interview
    </a>
  </p>
  <p style="font-size: 12px; color: #94a3b8; line-height: 1.6;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${params.link}" style="color: #94a3b8;">${params.link}</a>
  </p>
  <p style="font-size: 13px; color: #64748b; margin-top: 24px;">— ${params.entityName} Hiring Team</p>
</div>`
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

  const { data: application } = await supabase
    .from('applications')
    .select('id, candidate_id, candidates(first_name, last_name, email), jobs(title, entities(name))')
    .eq('id', params.id)
    .single()

  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const candidate = (application as any).candidates
  const job = (application as any).jobs

  if (!candidate?.email) {
    return NextResponse.json({ error: 'This candidate has no email on file' }, { status: 400 })
  }

  const appBase = process.env.APP_BASE_URL ?? 'https://staffing.assorted.group'
  const link = `${appBase}/schedule/${application.id}`
  const entityName = job?.entities?.name ?? 'Assorted Group'
  const roleTitle = job?.title ?? 'the role'

  try {
    await sendEmail({
      to: candidate.email,
      subject: `Schedule your interview — ${roleTitle}`,
      html: scheduleEmailHtml({
        candidateName: candidate.first_name,
        roleTitle,
        entityName,
        link,
      }),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }

  await supabase.from('outbound_messages').insert({
    candidate_id: application.candidate_id,
    application_id: application.id,
    channel: 'email',
    template_key: 'scheduleInvite',
    payload: { role: roleTitle, link },
    status: 'sent',
    sent_at: new Date().toISOString(),
    scheduled_for: new Date().toISOString(),
  })

  await logActivity(supabase, {
    entityType: 'application',
    entityId: application.id,
    actor: session.user.id,
    action: 'schedule_email_sent',
    reason: `Sent to ${candidate.email}`,
  })

  return NextResponse.json({ ok: true })
}
