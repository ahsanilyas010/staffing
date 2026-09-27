import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ClientRootPage() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/client/login')

  const { data: clientUser } = await supabase
    .from('client_users')
    .select('clients(slug)')
    .eq('auth_user_id', session.user.id)
    .single()

  const slug = (clientUser as any)?.clients?.slug
  if (!slug) redirect('/client/login')

  redirect(`/client/${slug}`)
}
