'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Mail, Phone, MapPin, MessageCircle, Plus, Trash2, Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDate, formatRelative, initials } from '@/lib/utils'
import {
  REQUIREMENT_STATUSES, URGENCY_CLASS, statusMeta, sourceCtaLabel, whatsappUrl, canWrite,
} from '@/lib/clientRequirements'
import type {
  ClientRequirement, ClientRequirementNote, ClientRequirementStatus, HrUser, HrUserRole,
} from '@/lib/supabase/types'

type HrUserLite = Pick<HrUser, 'id' | 'full_name' | 'email'>

interface Props {
  requirement: ClientRequirement
  notes: ClientRequirementNote[]
  hrUsers: HrUserLite[]
  role: HrUserRole | null
}

const READ_ONLY_MSG = 'Your role is read-only (viewer) — ask an admin for edit access.'

export default function RequirementDetail({ requirement: init, notes: initNotes, hrUsers, role }: Props) {
  const router = useRouter()
  const [req, setReq]           = useState(init)
  const [notes, setNotes]       = useState(initNotes)
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const editable = canWrite(role)
  const isAdmin  = role === 'admin'
  const st       = statusMeta(req.status)
  const wa       = whatsappUrl(req.phone)

  // RLS blocks updates silently (0 rows), so ask for the row back to detect it
  async function update(patch: Partial<Pick<ClientRequirement, 'status' | 'assigned_to'>>) {
    setSaving(true)
    setError(null)
    const { data, error: err } = await createClient()
      .from('client_requirements')
      .update(patch)
      .eq('id', req.id)
      .select('*, assignee:hr_users(id,full_name,email)')
    setSaving(false)
    if (err || !data?.length) {
      setError(err ? `Could not save: ${err.message}` : READ_ONLY_MSG)
      return
    }
    setReq(data[0] as ClientRequirement)
    router.refresh() // keeps the sidebar "new" badge in sync
  }

  async function addNote() {
    const content = noteText.trim()
    if (!content) return
    setSaving(true)
    setError(null)
    const { data, error: err } = await createClient()
      .from('client_requirement_notes')
      .insert({ requirement_id: req.id, content })
      .select('*, author:hr_users(id,full_name,email)')
      .single()
    setSaving(false)
    if (err || !data) {
      setError(err ? `Could not add the note: ${err.message}` : READ_ONLY_MSG)
      return
    }
    setNotes(n => [data as ClientRequirementNote, ...n])
    setNoteText('')
  }

  async function remove() {
    if (!confirm(`Delete the requirement from ${req.company_name}? This cannot be undone.`)) return
    setSaving(true)
    setError(null)
    const { data, error: err } = await createClient()
      .from('client_requirements')
      .delete()
      .eq('id', req.id)
      .select('id')
    setSaving(false)
    if (err || !data?.length) {
      setError(err ? `Could not delete: ${err.message}` : 'Only admins can delete requirements.')
      return
    }
    router.push('/requirements')
    router.refresh()
  }

  const nameParts = req.contact_name.split(' ')

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/requirements" className="btn-ghost inline-flex -ml-2 text-slate-500">
        <ChevronLeft className="h-4 w-4" /> All requirements
      </Link>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{error}</p>
      )}

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-14 w-14 rounded-full bg-brand-100 text-brand-700 text-lg font-bold
                          flex items-center justify-center shrink-0">
            {initials(nameParts[0] ?? '', nameParts[1] ?? '')}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{req.company_name}</h1>
            <p className="text-slate-500">{req.contact_name}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
              <a href={`mailto:${req.email}`} className="flex items-center gap-1 hover:text-brand-600">
                <Mail className="h-4 w-4" /> {req.email}
              </a>
              <a href={`tel:${req.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-1 hover:text-brand-600">
                <Phone className="h-4 w-4" /> {req.phone}
              </a>
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {req.country}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            <a href={`mailto:${req.email}?subject=${encodeURIComponent('Your hiring requirement — Assorted Staffing')}`}
               className="btn-ghost text-xs">
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          </div>
        </div>

        {/* Status + assignee */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="req-status">Status</label>
            <select
              id="req-status"
              value={req.status}
              onChange={e => update({ status: e.target.value as ClientRequirementStatus })}
              disabled={saving || !editable}
              className="input w-auto"
            >
              {REQUIREMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="req-assignee">Assigned to</label>
            <select
              id="req-assignee"
              value={req.assigned_to ?? ''}
              onChange={e => update({ assigned_to: e.target.value || null })}
              disabled={saving || !editable}
              className="input w-auto min-w-[200px]"
            >
              <option value="">Unassigned</option>
              {hrUsers.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </select>
          </div>
          <span className={cn('badge', st.className)}>{st.label}</span>
          {!editable && <span className="text-xs text-slate-400">Read-only access</span>}
          {isAdmin && (
            <button onClick={remove} disabled={saving} className="btn-ghost text-red-600 hover:bg-red-50 ml-auto">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Requirement */}
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Requirement</h2>
          <div>
            <p className="text-sm text-slate-500 mb-1">Role(s) to hire</p>
            <p className="text-slate-900 font-medium whitespace-pre-wrap">{req.roles}</p>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-2">
            <div className="flex justify-between border-b border-slate-50 pb-1">
              <dt className="text-slate-500">Number of people</dt>
              <dd className="text-slate-900 font-medium flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" /> {req.headcount}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1">
              <dt className="text-slate-500">Hiring type</dt>
              <dd className="text-slate-900 font-medium">{req.hiring_type}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1">
              <dt className="text-slate-500">Urgency</dt>
              <dd><span className={cn('badge', URGENCY_CLASS[req.urgency])}>{req.urgency}</span></dd>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1">
              <dt className="text-slate-500">Received</dt>
              <dd className="text-slate-900 font-medium">{formatDate(req.created_at)}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1">
              <dt className="text-slate-500">Last activity</dt>
              <dd className="text-slate-900 font-medium">{formatRelative(req.updated_at)}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1 gap-3">
              <dt className="text-slate-500 shrink-0">Came from</dt>
              <dd className="text-slate-900 font-medium text-right">{sourceCtaLabel(req.source_cta)}</dd>
            </div>
          </dl>
          <div className="pt-2">
            <p className="text-sm text-slate-500 mb-1">Message</p>
            {req.message
              ? <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{req.message}</p>
              : <p className="text-sm text-slate-400">No message</p>}
          </div>
        </div>

        {/* Notes */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Internal notes ({notes.length})</h2>
          {editable && (
            <div className="flex gap-2">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Call summary, budget, next step…"
                rows={2}
                maxLength={5000}
                className="input resize-none flex-1"
              />
              <button onClick={addNote} disabled={saving || !noteText.trim()} className="btn-primary self-end">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          )}
          <div className="space-y-3">
            {notes.map(n => (
              <div key={n.id} className="border-l-2 border-brand-200 pl-3">
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.content}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {n.author?.full_name ?? n.author?.email ?? 'Unknown'} · {formatRelative(n.created_at)}
                </p>
              </div>
            ))}
            {notes.length === 0 && <p className="text-sm text-slate-400">No notes yet</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
