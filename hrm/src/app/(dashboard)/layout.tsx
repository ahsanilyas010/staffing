import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  // getUser() verifies the token with Supabase Auth; getSession() only reads the cookie
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: hrUser } = await supabase
    .from('hr_users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // Logged in but not on the HR team: no dashboard access
  if (!hrUser) redirect('/auth/signout?error=not_authorized')

  return (
    <div className="flex min-h-screen">
      <Sidebar user={hrUser} />
      <main className="flex-1 min-w-0 p-6 lg:p-8">{children}</main>
    </div>
  )
}
