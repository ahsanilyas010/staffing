import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cn, formatRelative } from '@/lib/utils'
import { orLikeValue } from '@/lib/filters'
import {
  REQUIREMENT_STATUSES, HIRING_TYPES, URGENCIES, URGENCY_CLASS, statusMeta,
} from '@/lib/clientRequirements'
import type { ClientRequirement } from '@/lib/supabase/types'

export const revalidate = 0

type Params = { q?: string; status?: string; type?: string; urgency?: string; assigned?: string }

export default async function RequirementsPage({ searchParams }: { searchParams: Params }) {
  const supabase = createClient()
  const q        = searchParams.q?.trim() || ''
  const status   = searchParams.status || ''
  const type     = searchParams.type || ''
  const urgency  = searchParams.urgency || ''
  const assigned = searchParams.assigned || ''

  let query = supabase
    .from('client_requirements')
    .select('*, assignee:hr_users(id,full_name,email)')
    .order('created_at', { ascending: false })

  if (q) {
    const v = orLikeValue(q)
    query = query.or(`company_name.ilike.${v},contact_name.ilike.${v},email.ilike.${v},roles.ilike.${v}`)
  }
  if (status)   query = query.eq('status', status)
  if (type)     query = query.eq('hiring_type', type)
  if (urgency)  query = query.eq('urgency', urgency)
  if (assigned === 'unassigned') query = query.is('assigned_to', null)
  else if (assigned)             query = query.eq('assigned_to', assigned)

  const [{ data: requirements, error }, { data: statusRows }, { data: hrUsers }] = await Promise.all([
    query,
    supabase.from('client_requirements').select('status'),
    supabase.from('hr_users').select('id,full_name,email').order('full_name'),
  ])

  const counts = new Map<string, number>()
  for (const r of statusRows ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)

  const filtering = Boolean(q || status || type || urgency || assigned)
  const rows = (requirements ?? []) as ClientRequirement[]

  // Keep the other filters when clicking a status card
  const statusHref = (value: string) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (type) p.set('type', type)
    if (urgency) p.set('urgency', urgency)
    if (assigned) p.set('assigned', assigned)
    if (value && value !== status) p.set('status', value)
    const s = p.toString()
    return s ? `/requirements?${s}` : '/requirements'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Requirements</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Hiring requests from the website &ldquo;Hire Talent&rdquo; form
          </p>
        </div>
        <span className="text-slate-500 text-sm">
          {rows.length} {filtering ? 'matching' : 'total'}
        </span>
      </div>

      {/* Status summary — click to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {REQUIREMENT_STATUSES.map(s => (
          <Link
            key={s.value}
            href={statusHref(s.value)}
            className={cn(
              'card px-4 py-3 transition-colors hover:border-brand-300',
              status === s.value && 'ring-2 ring-brand-500 border-transparent'
            )}
          >
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{counts.get(s.value) ?? 0}</p>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <form className="flex gap-3 flex-wrap">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search company, contact, email, role…"
          className="input max-w-xs"
        />
        <select name="status" defaultValue={status} className="input max-w-[170px]" aria-label="Status">
          <option value="">All statuses</option>
          {REQUIREMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select name="type" defaultValue={type} className="input max-w-[170px]" aria-label="Hiring type">
          <option value="">All hiring types</option>
          {HIRING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="urgency" defaultValue={urgency} className="input max-w-[170px]" aria-label="Urgency">
          <option value="">Any urgency</option>
          {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select name="assigned" defaultValue={assigned} className="input max-w-[190px]" aria-label="Assigned to">
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {hrUsers?.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
        </select>
        <button type="submit" className="btn-primary">Filter</button>
        {filtering && <Link href="/requirements" className="btn-ghost">Clear</Link>}
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          Could not load client requirements: {error.message}
        </p>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              {['Received', 'Company', 'Roles', 'People', 'Hiring type', 'Urgency', 'Country', 'Status', 'Assigned to']
                .map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => {
              const st = statusMeta(r.status)
              const hot = r.urgency === 'ASAP' && r.status === 'new'
              return (
                <tr key={r.id} className={cn('hover:bg-slate-50 transition-colors', hot && 'bg-red-50/40')}>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatRelative(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/requirements/${r.id}`} className="group block">
                      <p className="font-medium text-slate-900 group-hover:text-brand-600">{r.company_name}</p>
                      <p className="text-slate-400 text-xs">{r.contact_name} · {r.email}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[260px]">
                    <p className="line-clamp-2">{r.roles}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-medium">{r.headcount}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.hiring_type}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge whitespace-nowrap', URGENCY_CLASS[r.urgency])}>{r.urgency}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.country}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge whitespace-nowrap', st.className)}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {r.assignee ? (r.assignee.full_name ?? r.assignee.email) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  {filtering ? 'No requirements match these filters' : 'No client requirements yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
