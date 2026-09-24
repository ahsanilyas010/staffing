'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Phone, Mail, MapPin, Star,
  ChevronLeft, Plus, ExternalLink
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDate, formatRelative, scoreColor, initials } from '@/lib/utils'
import type { Candidate, PipelineStage, Note, Interview } from '@/lib/supabase/types'

interface Props {
  candidate: Candidate
  stages: PipelineStage[]
  notes: Note[]
  interviews: Interview[]
  cvUrl: string | null
}

export default function CandidateProfile({ candidate: init, stages, notes: initNotes, cvUrl }: Props) {
  const router  = useRouter()
  const [candidate, setCandidate] = useState(init)
  const [notes, setNotes]         = useState(initNotes)
  const [noteText, setNoteText]   = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [movingStage, setMovingStage] = useState(false)

  async function changeStage(stageId: string) {
    setMovingStage(true)
    const supabase = createClient()
    // RLS blocks updates silently (0 rows), so ask for the row back to detect it
    const { data: updated, error } = await supabase
      .from('candidates')
      .update({ stage_id: stageId, last_activity_at: new Date().toISOString() })
      .eq('id', candidate.id)
      .select('id')
    if (error || !updated?.length) {
      alert('Could not change the stage. Your role may be read-only (viewer) — ask an admin for edit access.')
      setMovingStage(false)
      return
    }
    setCandidate(c => ({
      ...c,
      stage_id: stageId,
      stage: stages.find(s => s.id === stageId),
    }))
    setMovingStage(false)
    router.refresh()
  }

  async function addNote() {
    if (!noteText.trim()) return
    setAddingNote(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('notes')
      .insert({ candidate_id: candidate.id, content: noteText.trim(), note_type: 'general' })
      .select('*, author:hr_users(id,full_name,email)')
      .single()
    setAddingNote(false)
    if (error || !data) {
      alert('Could not add the note. Your role may be read-only (viewer) — ask an admin for edit access.')
      return
    }
    setNotes(n => [data as Note, ...n])
    setNoteText('')
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Link href="/candidates" className="btn-ghost inline-flex -ml-2 text-slate-500">
        <ChevronLeft className="h-4 w-4" /> All candidates
      </Link>

      {/* Header card */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-brand-100 text-brand-700 text-lg font-bold
                          flex items-center justify-center shrink-0">
            {initials(candidate.first_name, candidate.last_name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">
              {candidate.first_name} {candidate.last_name}
            </h1>
            <p className="text-slate-500">{candidate.preferred_role ?? 'Role not specified'}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
              {candidate.email && (
                <a href={`mailto:${candidate.email}`} className="flex items-center gap-1 hover:text-brand-600">
                  <Mail className="h-4 w-4" /> {candidate.email}
                </a>
              )}
              {candidate.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" /> {candidate.phone}
                </span>
              )}
              {candidate.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {candidate.country}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 shrink-0">
            {cvUrl && (
              <a href={cvUrl} target="_blank" rel="noopener" className="btn-ghost text-xs">
                <FileText className="h-3.5 w-3.5" /> CV
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {candidate.linkedin_url && (
              <a href={candidate.linkedin_url} target="_blank" rel="noopener" className="btn-ghost text-xs">
                LinkedIn <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Stage selector + score */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-4">
          <div>
            <p className="label">Stage</p>
            <select
              value={candidate.stage_id ?? ''}
              onChange={e => changeStage(e.target.value)}
              disabled={movingStage}
              className="input w-auto"
            >
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {candidate.overall_score !== null && (
            <div>
              <p className="label">Score</p>
              <span className={cn('flex items-center gap-1 text-lg font-bold', scoreColor(candidate.overall_score))}>
                <Star className="h-4 w-4" />
                {candidate.overall_score.toFixed(1)} / 10
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            ['Experience', candidate.experience_years],
            ['Salary expectation', candidate.salary_expectation],
            ['Relocation', candidate.relocation_pref],
            ['Source', candidate.source],
            ['Applied', formatDate(candidate.created_at)],
            ['Last activity', formatRelative(candidate.last_activity_at)],
          ].map(([label, val]) => val ? (
            <div key={label} className="flex justify-between border-b border-slate-50 pb-1">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-slate-900 font-medium text-right">{val}</dd>
            </div>
          ) : null)}
        </dl>
        {candidate.skills && candidate.skills.length > 0 && (
          <div className="pt-2">
            <p className="text-sm text-slate-500 mb-2">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map(s => (
                <span key={s} className="badge bg-brand-50 text-brand-700">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Notes ({notes.length})</h2>
        <div className="flex gap-2">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            className="input resize-none flex-1"
          />
          <button
            onClick={addNote}
            disabled={addingNote || !noteText.trim()}
            className="btn-primary self-end"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="border-l-2 border-brand-200 pl-3 py-0.5">
              <p className="text-sm text-slate-800">{note.content}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {note.author?.full_name ?? 'HR Team'} · {formatRelative(note.created_at)}
              </p>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-sm text-slate-400">No notes yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
