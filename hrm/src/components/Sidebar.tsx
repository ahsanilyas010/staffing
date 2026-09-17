'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, Briefcase, Mic2, BarChart3, LogOut
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, initials } from '@/lib/utils'
import type { HrUser } from '@/lib/supabase/types'

const nav = [
  { href: '/pipeline',    label: 'Pipeline',    icon: LayoutDashboard },
  { href: '/candidates',  label: 'Candidates',  icon: Users },
  { href: '/jobs',        label: 'Jobs',        icon: Briefcase },
  { href: '/interviews',  label: 'AI Interviews', icon: Mic2 },
  { href: '/reports',     label: 'Reports',     icon: BarChart3 },
]

export default function Sidebar({ user }: { user: HrUser | null }) {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-white border-r border-slate-200 min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <span className="font-bold text-brand-600 text-lg tracking-tight">Assorted Staffing</span>
        <p className="text-xs text-slate-400 mt-0.5">HRM Portal</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-brand-50 text-brand-600'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-100">
        {user && (
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold
                            flex items-center justify-center shrink-0">
              {initials(user.full_name?.split(' ')[0] ?? user.email[0], user.full_name?.split(' ')[1] ?? '')}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user.full_name ?? user.email}</p>
              <p className="text-xs text-slate-500 capitalize">{user.role}</p>
            </div>
          </div>
        )}
        <button onClick={signOut} className="btn-ghost w-full justify-start gap-2 text-slate-500">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
