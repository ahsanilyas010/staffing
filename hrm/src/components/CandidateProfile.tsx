'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Phone, Mail, MapPin, Star, Mic2,
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

export default function CandidateProfile({ candidate: init, stages, notes: initNotes, interviews, cvUrl }: Props) {
  const router  = useRouter()
  const [candidate, setCandidate] = useState(init)
  const [notes, setNotes]         = useState(initNotes)
  const [noteText, setNoteText]   = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [launching, setLaunching]   = useState(false)
  const [movingStage, setMovingStage] = useState(false)

  async function changeStage(stageId: string) {
    setMovingStage(true)
    const supabase = createClient()
    await supabase
      .from('candidates')
      .update({ stage_id: stageId, last_activity_at: new Date().toISOString() })
      .eq('id', candidate.id)
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
    const { data } = await supabase
      .from('notes')
      .insert({ candidate_id: candidate.id, content: noteText.trim(), note_type: 'general' })
      .select('*, author:hr_users(id,full_name,email)')
      .single()
    if (data) setNotes(n => [data as Note, ...n])
    setNoteText('')
    setAddingNote(false)
  }

  async function launchAiInterview() {
    setLaunching(true)
    const res = await fetch('/api/trigger-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidate.id }),
    })
    const json = await res.json()
    if (res.ok) {
      alert(`AI interview call initiated! Call ID: ${json.vapi_call_id}`)
      router.refresh()
    } else {
      alert(`Error: ${json.error}`)
    }
    setLaunching(false)
  }

  const aiStage = stages.find(s => s.stage_type === 'ai_interview')

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

        {/* Stage selector + score + AI button */}
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
              <p className="label">AI Score</p>
              <span className={cn('flex items-center gap-1 text-lg font-bold', scoreColor(candidate.overall_score))}>
                <Star className="h-4 w-4" />
                {candidate.overall_score.toFixed(1)} / 10
              </span>
            </div>
          )}

          <div className="ml-auto">
            <button
              onClick={launchAiInterview}
              disabled={launching || !candidate.phone}
              className="btn-primary"
              title={!candidate.phone ? 'No phone number on record' : ''}
            >
              <Mic2 className="h-4 w-4" />
              {launching ? 'Calling…' : 'Start AI Interview'}
            </button>
            {!candidate.phone && (
              <p className="text-xs text-red-500 mt-1">Phone number required</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Details */}
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Details</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Experience', candidate.experience_years],
              ['Salary expectation', candidate.salary_expectation],
              ['Relocation', candidate.relocation_pref],
              ['Source', candidate.source],
              ['Applied', formatDate(candidate.created_at)],
              ['Last activity', formatRelative(candidate.last_activity_at)],
            ].map(([label, val]) => val ? (
              <div key={label} className="flex justify-between">
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

        {/* AI Interviews */}
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">AI Interviews</h2>
          {interviews.length === 0 ? (
            <p className="text-sm text-slate-400">No interviews yet</p>
          ) : (
            <div className="space-y-3">
              {interviews.map(interview => (
                <div key={interview.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'badge',
                      interview.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                      interview.status === 'in_progress' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    )}>
                      {interview.status}
                    </span>
                    {interview.overall_score !== null && (
                      <span className={cn('text-sm font-bold', scoreColor(interview.overall_score))}>
                        {interview.overall_score.toFixed(1)}/10
                      </span>
                    )}
                  </div>
                  {interview.status === 'completed' && interview.transcript && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 font-medium">AI Summary</p>
                      <p className="text-sm text-slate-700 mt-0.5">
                        {(interview.transcript as unknown as { ai_summary?: string })?.ai_summary ?? 'No summary available'}
                      </p>
                      {(interview.transcript as unknown as { recommendation?: string })?.recommendation && (
                        <span className={cn(
                          'badge mt-2',
                          (interview.transcript as unknown as { recommendation?: string }).recommendation === 'proceed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : (interview.transcript as unknown as { recommendation?: string }).recommendation === 'reject'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        )}>
                          {(interview.transcript as unknown as { recommendation?: string }).recommendation}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">{formatRelative(interview.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
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
